"""The multiplayer lobby, kept in memory: the local stand-in for the hosted service (serve.py routes /api/lobby/ here).

Rooms are listed while their host keeps calling rooms/<id>/host; each player's handshake (a WebRTC offer, then the
host's answer) waits here until the other side collects it. The race itself never comes through. See src/net.js.
"""
import secrets
import threading
import time

MAPS = ('space', 'forest', 'ice', 'desert', 'ocean', 'pyramid')
ROOM_TTL = 30          # s a room stays listed after its host's last call
JOIN_TTL = 60          # s an offer waits for its answer
MAX_SDP = 16384


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
