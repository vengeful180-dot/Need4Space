"""The multiplayer lobby (lobby.py): rooms listed and expiring, the handshake passed both ways once, the host's secret,
full / racing / other-version rooms refused, the games online counted, the global chat kept and filtered."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lobby
from lobby import Lobby, LobbyError

ROOM = dict(name='Test room', map='ice', max=4, host='Host', version=1)


class LobbyTest(unittest.TestCase):
    def setUp(self):
        self.L = Lobby()
        self.room = self.L.create(dict(ROOM))

    def test_listed_with_its_version(self):
        rooms = self.L.list('1')['rooms']
        self.assertEqual([r['id'] for r in rooms], [self.room['id']])
        self.assertNotIn('token', rooms[0])
        self.assertEqual(self.L.list('2')['rooms'], [])

    def test_handshake(self):
        rid, tok = self.room['id'], self.room['token']
        j = self.L.join(rid, dict(name='Guest', sdp='offer-sdp', version=1))
        self.assertEqual(self.L.answer(rid, j['joinId'], j['token'])['state'], 'waiting')
        got = self.L.host(rid, dict(token=tok, players=1, state='open'))['joins']
        self.assertEqual([(g['joinId'], g['sdp'], g['name']) for g in got], [(j['joinId'], 'offer-sdp', 'Guest')])
        # (an offer goes to the host once)
        self.assertEqual(self.L.host(rid, dict(token=tok, players=1, state='open'))['joins'], [])
        self.L.host(rid, dict(token=tok, players=2, state='open', answers=[dict(joinId=j['joinId'], sdp='answer-sdp')]))
        self.assertEqual(self.L.answer(rid, j['joinId'], 'wrong')['state'], 'gone')
        self.assertEqual(self.L.answer(rid, j['joinId'], j['token']), {'state': 'answered', 'sdp': 'answer-sdp'})
        self.assertEqual(self.L.answer(rid, j['joinId'], j['token'])['state'], 'gone')
        self.assertEqual(self.L.list('1')['rooms'][0]['players'], 2)

    def test_host_secret(self):
        with self.assertRaises(LobbyError) as e:
            self.L.host(self.room['id'], dict(token='not-it'))
        self.assertEqual(e.exception.status, 403)
        self.L.close(self.room['id'], dict(token='not-it'))
        self.assertEqual(len(self.L.list()['rooms']), 1)
        self.L.close(self.room['id'], dict(token=self.room['token']))
        self.assertEqual(self.L.list()['rooms'], [])

    def test_refused(self):
        rid, tok = self.room['id'], self.room['token']
        for state, players, version, why in (('racing', 1, 1, 'racing'), ('open', 4, 1, 'full'), ('open', 1, 2, 'version')):
            self.L.host(rid, dict(token=tok, players=players, state=state))
            with self.assertRaises(LobbyError, msg=why) as e:
                self.L.join(rid, dict(name='G', sdp='x', version=version))
            self.assertEqual(e.exception.status, 409, why)
        with self.assertRaises(LobbyError) as e:
            self.L.join('nope', dict(name='G', sdp='x', version=1))
        self.assertEqual(e.exception.status, 404)
        with self.assertRaises(LobbyError):
            self.L.create(dict(ROOM, map='moon'))

    def test_expiry(self):
        rid = self.room['id']
        j = self.L.join(rid, dict(name='G', sdp='x', version=1))
        t0 = lobby.time.time()
        for dt in (25, 50, lobby.JOIN_TTL + 1):                     # (the host still calling: the room stays)
            with patch.object(lobby.time, 'time', return_value=t0 + dt):
                self.L.host(rid, dict(token=self.room['token']))
        with patch.object(lobby.time, 'time', return_value=t0 + lobby.JOIN_TTL + 1):
            self.assertEqual(self.L.answer(rid, j['joinId'], j['token'])['state'], 'gone')
            self.assertEqual(len(self.L.list()['rooms']), 1)
        t0 += lobby.JOIN_TTL + 1
        with patch.object(lobby.time, 'time', return_value=t0 + lobby.JOIN_TTL + lobby.ROOM_TTL + 2):
            self.assertEqual(self.L.list()['rooms'], [])

    def test_presence(self):
        P = lambda pid, v=1: self.L.presence(dict(id=pid, version=v))
        self.assertEqual(P('tab-aaaaaaaa'), {'online': 1, 'rooms': 1, 'players': 1})
        self.assertEqual(P('tab-bbbbbbbb')['online'], 2)
        self.assertEqual(P('tab-aaaaaaaa')['online'], 2)              # (the same tab again: counted once)
        self.assertEqual(P('tab-cccccccc', v=2)['rooms'], 0)          # (rooms of its own version only)
        for bad in ('short', 'has space in it', 'x' * 41, 7, None, '<script>alert</script>'):
            with self.assertRaises(LobbyError, msg=repr(bad)) as e:
                self.L.presence(dict(id=bad, version=1))
            self.assertEqual(e.exception.status, 400)
        # (gone quiet: no longer online - the room too, its host gone)
        t0 = lobby.time.time()
        with patch.object(lobby.time, 'time', return_value=t0 + lobby.PRESENCE_TTL + 6):
            self.assertEqual(P('tab-dddddddd'), {'online': 1, 'rooms': 0, 'players': 0})
        # (a cap on the ids held: past it a new one waits for an old one to lapse)
        with patch.object(lobby, 'MAX_PRESENCE', 2):
            L = Lobby()
            for k in range(3):
                L.presence(dict(id=f'tab-cap{k:05d}', version=1))
            self.assertEqual(L.presence(dict(id='tab-cap00000', version=1))['online'], 2)

    def test_chat(self):
        say = lambda pid, text, name='Pilot': self.L.chat_say(dict(id=pid, name=name, text=text))['message']
        m = say('tab-chat0001', 'gg  wp\x00 ')
        self.assertEqual((m['n'], m['name'], m['text']), (1, 'Pilot', 'gg wp'))
        self.assertNotIn('tab-chat0001', str(m))                     # (the sender's id never handed out)
        with self.assertRaises(LobbyError) as e:                      # (one line every 3 s)
            say('tab-chat0001', 'again')
        self.assertEqual(e.exception.status, 429)
        for bad in ('see www.x.org', 'join discord.gg/abc', 'a@b.co', 'call 0722 123 456'):
            with self.assertRaises(LobbyError, msg=bad) as e:
                say('tab-chat0002', bad)
            self.assertEqual(e.exception.status, 400)
        for bad in (dict(name='', text='hi'), dict(name='P', text='   '), dict(name='P', text='hi', id='x')):
            with self.assertRaises(LobbyError):
                self.L.chat_say(dict(dict(id='tab-chat0003'), **bad))
        self.assertEqual(say('tab-chat0004', 'what the fuck, nice cockpit, sh1t, Dickens, bitchin')['text'],
                         'what the ****, nice cockpit, ****, Dickens, *******')
        got = self.L.chat_since(0)
        self.assertEqual([x['n'] for x in got['messages']], [1, 2])
        self.assertEqual(self.L.chat_since(1)['messages'][0]['n'], 2)
        self.assertEqual(self.L.chat_since('junk')['last'], 2)
        # (the last 50 kept, an hour at most)
        t0 = lobby.time.time()
        for k in range(60):
            with patch.object(lobby.time, 'time', return_value=t0 + 4 * k):
                say(f'tab-many{k:04d}', f'line {k}')
        lines = self.L.chat_since(0)['messages']
        self.assertEqual((len(lines), lines[-1]['text']), (50, 'line 59'))
        with patch.object(lobby.time, 'time', return_value=t0 + 4 * 59 + lobby.CHAT_TTL + 1):
            self.assertEqual(self.L.chat_since(0)['messages'], [])

    def test_names_cleaned(self):
        r = self.L.create(dict(ROOM, name='  A\x00 <b>room</b>\n  with   space  ' + 'x' * 50))
        name = next(x['name'] for x in self.L.list()['rooms'] if x['id'] == r['id'])
        self.assertTrue(name.startswith('A <b>room</b> with space'))
        self.assertLessEqual(len(name), 32)


if __name__ == '__main__':
    unittest.main()
