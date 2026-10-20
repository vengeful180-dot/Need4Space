"""The multiplayer lobby, kept in memory: the local stand-in for the hosted service (serve.py routes /api/lobby/ here).

Rooms are listed while their host keeps calling rooms/<id>/host; each player's handshake (a WebRTC offer, then the
host's answer) waits here until the other side collects it. The race itself never comes through. See src/net.js.
Every open game also says it is there (presence: an anonymous random id per browser tab, every 30 s) - the title's
count of the players online, with the rooms open and the players in them. And the title's global chat: the last
CHAT_KEEP lines of the last hour, one line every CHAT_GAP s from each game, links / emails / phone numbers refused and
swear words masked.
"""
import hashlib
import re
import secrets
import threading
import time

MAPS = ('space', 'forest', 'ice', 'desert', 'ocean', 'pyramid')
ROOM_TTL = 30          # s a room stays listed after its host's last call
JOIN_TTL = 60          # s an offer waits for its answer
MAX_SDP = 16384
PRESENCE_TTL = 75      # s a game counts as online after its last heartbeat (sent every 30 s; a hidden tab's every 60)
MAX_PRESENCE = 20000   # ids held at most (past it a new one is counted only once an old one lapses)
PRESENCE_ID = re.compile(r'[A-Za-z0-9_-]{8,40}')
CHAT_KEEP = 50         # lines kept
CHAT_TTL = 3600        # s a line is kept
CHAT_GAP = 3.0         # s between two lines from the same game
CHAT_LEN = 120         # characters in a line
NAME_LEN = 24
# not allowed in a line or a name: links, emails, phone numbers (7+ digits, spaces / dots / dashes between allowed)
BLOCKED = (
    re.compile(r'https?://|www\.', re.I),
    re.compile(r'\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|de|uk|co|me|tv|app|dev|link|site|online|info|biz|ly|to|cc)\b', re.I),
    re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+'),
    re.compile(r'(\d[\s.-]?){7,}'),
)
# masked with * (letter for letter): anywhere in a word, and as whole words only (cockpit, class, Dickens left alone);
# matched on the line with 0 1 3 4 5 7 @ $ read as o i e a s t a s
SWEAR_ANY = ('fuck', 'shit', 'cunt', 'nigg', 'fagg', 'motherf', 'bitch', 'whore', 'slut', 'retard')
SWEAR_WORD = ('ass', 'asshole', 'arse', 'arsehole', 'dick', 'dickhead', 'cock', 'pussy', 'bastard', 'fag', 'twat', 'prick',
              'wanker', 'bollocks', 'piss', 'tits', 'nazi', 'rape', 'rapist', 'kys')
LEET = str.maketrans('013457@$', 'oieastas')


def clean(text, limit):
    if not isinstance(text, str):
        return ''
    text = ''.join(c for c in text if ord(c) >= 32 and ord(c) != 127)
    return ' '.join(text.split())[:limit]


class LobbyError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Lobby:
    def __init__(self):
        self.rooms = {}
        self.seen = {}         # presence: id -> its last heartbeat (s); nothing else about it is kept
        self.pruned = 0.0
        self.chat = []         # the global chat: { n, t, from, name, text }, oldest first
        self.chat_n = 0
        self.said = {}         # id -> when it last said a line (the gap)
        self.salt = secrets.token_hex(16)   # (a line's 'from': its game's id hashed with this - mutable, not traceable)
        self.lock = threading.Lock()

    def sweep(self, now):
        for rid in [r for r, room in self.rooms.items() if now - room['seen'] > ROOM_TTL]:
            del self.rooms[rid]
        for room in self.rooms.values():
            for jid in [j for j, join in room['joins'].items() if now - join['at'] > JOIN_TTL]:
                del room['joins'][jid]

    def room(self, rid):
        room = self.rooms.get(rid)
        if not room:
            raise LobbyError(404, 'That room has closed.')
        return room

    def host_room(self, rid, token):
        room = self.room(rid)
        if not isinstance(token, str) or not secrets.compare_digest(token, room['token']):
            raise LobbyError(403, 'Not the host of this room.')
        return room

    def list(self, version=None):
        now = time.time()
        with self.lock:
            self.sweep(now)
            rooms = [r for r in self.rooms.values() if version is None or str(r['version']) == str(version)]
            rooms.sort(key=lambda r: -r['created'])
            return {'rooms': [{'id': r['id'], 'name': r['name'], 'map': r['map'], 'host': r['host'], 'players': r['players'],
                               'max': r['max'], 'state': r['state'], 'version': r['version']} for r in rooms[:50]]}

    def presence(self, data):
        """a game's heartbeat: counted online for PRESENCE_TTL s; answers the count, the rooms open for its version and
        the players in them"""
        pid = data.get('id')
        if not isinstance(pid, str) or not PRESENCE_ID.fullmatch(pid):
            raise LobbyError(400, 'Invalid request.')
        now = time.time()
        with self.lock:
            self.sweep(now)
            if now - self.pruned > 5:
                self.seen = {k: t for k, t in self.seen.items() if now - t <= PRESENCE_TTL}
                self.pruned = now
            if pid in self.seen or len(self.seen) < MAX_PRESENCE:
                self.seen[pid] = now
            online = sum(1 for t in self.seen.values() if now - t <= PRESENCE_TTL)
            version = data.get('version')
            rooms = [r for r in self.rooms.values() if version is None or str(r['version']) == str(version)]
            return {'online': online, 'rooms': len(rooms), 'players': sum(r['players'] for r in rooms)}

    @staticmethod
    def blocked(text):
        return any(p.search(text) for p in BLOCKED)

    @staticmethod
    def masked(text):
        """swear words starred out, letter for letter (on the line as written; found on it with leet read as letters)"""
        plain = text.lower().translate(LEET)
        out = list(text)
        for word in SWEAR_ANY:                                # (the whole word it is in: "bitchin", "retarded")
            for m in re.finditer(re.escape(word), plain):
                a, z = m.start(), m.end()
                while a > 0 and plain[a - 1].isalnum():
                    a -= 1
                while z < len(plain) and plain[z].isalnum():
                    z += 1
                for i in range(a, z):
                    out[i] = '*'
        for word in SWEAR_WORD:
            for m in re.finditer(r'(?<![a-z])' + re.escape(word) + r'(?![a-z])', plain):
                for i in range(m.start(), m.end()):
                    out[i] = '*'
        return ''.join(out)

    def chat_trim(self, now):
        self.chat = [m for m in self.chat if now - m['t'] <= CHAT_TTL][-CHAT_KEEP:]
        self.said = {k: t for k, t in self.said.items() if now - t <= 60}

    def chat_say(self, data):
        """a line said on the title: { id, name, text } -> { message }"""
        pid = data.get('id')
        if not isinstance(pid, str) or not PRESENCE_ID.fullmatch(pid):
            raise LobbyError(400, 'Invalid request.')
        name, text = clean(data.get('name'), NAME_LEN), clean(data.get('text'), CHAT_LEN)
        if not name:
            raise LobbyError(400, 'Choose a pilot name first.')
        if not text:
            raise LobbyError(400, 'Say something first.')
        if self.blocked(text) or self.blocked(name):
            raise LobbyError(400, 'Links, emails and phone numbers are not allowed.')
        now = time.time()
        with self.lock:
            self.chat_trim(now)
            if now - self.said.get(pid, 0) < CHAT_GAP:
                raise LobbyError(429, 'Slow down - one line every 3 seconds.')
            self.said[pid] = now
            self.chat_n += 1
            sender = hashlib.sha256((self.salt + pid).encode()).hexdigest()[:10]
            msg = {'n': self.chat_n, 't': round(now, 1), 'from': sender, 'name': self.masked(name), 'text': self.masked(text)}
            self.chat.append(msg)
            self.chat = self.chat[-CHAT_KEEP:]
            return {'message': msg}

    def chat_since(self, since):
        """the lines after line `since` (0: all kept) -> { messages, last }"""
        try:
            since = int(since or 0)
        except (TypeError, ValueError):
            since = 0
        now = time.time()
        with self.lock:
            self.chat_trim(now)
            return {'messages': [m for m in self.chat if m['n'] > since], 'last': self.chat_n}

    def create(self, data):
        name, host = clean(data.get('name'), 32), clean(data.get('host'), 24)
        if data.get('map') not in MAPS:
            raise LobbyError(400, 'Choose a valid circuit.')
        if not name or not host:
            raise LobbyError(400, 'A room needs a name and a host.')
        try:
            size = int(data.get('max', 8))
        except (TypeError, ValueError):
            size = 8
        now = time.time()
        with self.lock:
            self.sweep(now)
            if len(self.rooms) >= 200:
                raise LobbyError(503, 'The lobby is full. Try again soon.')
            rid = secrets.token_hex(4)
            while rid in self.rooms:
                rid = secrets.token_hex(4)
            token = secrets.token_urlsafe(24)
            self.rooms[rid] = {'id': rid, 'token': token, 'name': name, 'host': host, 'map': data['map'], 'max': max(2, min(8, size)),
                               'players': 1, 'state': 'open', 'version': data.get('version'), 'created': now, 'seen': now,
                               'joins': {}}
            return {'id': rid, 'token': token}

    def host(self, rid, data):
        now = time.time()
        with self.lock:
            self.sweep(now)
            room = self.host_room(rid, data.get('token'))
            room['seen'] = now
            try:
                room['players'] = max(1, min(room['max'], int(data.get('players', room['players']))))
            except (TypeError, ValueError):
                pass
            if data.get('state') in ('open', 'racing'):
                room['state'] = data['state']
            for answer in data.get('answers') or []:
                join = room['joins'].get(answer.get('joinId')) if isinstance(answer, dict) else None
                sdp = answer.get('sdp') if join else None
                if join and isinstance(sdp, str) and 0 < len(sdp) <= MAX_SDP:
                    join['answer'] = sdp
            fresh = [j for j in room['joins'].values() if not j['taken']]
            for join in fresh:
                join['taken'] = True
            return {'joins': [{'joinId': j['id'], 'name': j['name'], 'sdp': j['offer']} for j in fresh]}

    def close(self, rid, data):
        with self.lock:
            room = self.rooms.get(rid)
            if room and isinstance(data.get('token'), str) and secrets.compare_digest(data['token'], room['token']):
                del self.rooms[rid]
            return {'ok': True}

    def join(self, rid, data):
        sdp = data.get('sdp')
        if not isinstance(sdp, str) or not 0 < len(sdp) <= MAX_SDP:
            raise LobbyError(400, 'Invalid connection offer.')
        now = time.time()
        with self.lock:
            self.sweep(now)
            room = self.room(rid)
            if str(data.get('version')) != str(room['version']):
                raise LobbyError(409, 'That room runs another version of the game. Reload the page.')
            if room['state'] != 'open':
                raise LobbyError(409, 'That room is racing - try again after the race.')
            if room['players'] >= room['max']:
                raise LobbyError(409, 'That room is full.')
            if len(room['joins']) >= 16:
                raise LobbyError(429, 'Too many players are joining at once. Try again in a moment.')
            jid, token = secrets.token_hex(6), secrets.token_urlsafe(18)
            room['joins'][jid] = {'id': jid, 'token': token, 'name': clean(data.get('name'), 24) or 'Pilot', 'offer': sdp,
                                  'answer': None, 'taken': False, 'at': now}
            return {'joinId': jid, 'token': token}

    def answer(self, rid, jid, token):
        now = time.time()
        with self.lock:
            self.sweep(now)
            room = self.rooms.get(rid)
            join = room and room['joins'].get(jid)
            if not join or not isinstance(token, str) or not secrets.compare_digest(token, join['token']):
                return {'state': 'gone', 'sdp': None}
            if join['answer']:
                del room['joins'][jid]                      # (collected once)
                return {'state': 'answered', 'sdp': join['answer']}
            return {'state': 'waiting', 'sdp': None}
