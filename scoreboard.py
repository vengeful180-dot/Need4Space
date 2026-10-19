"""Shared race times, stored locally or in a dedicated GitHub branch."""
import base64
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

MAPS = ('space', 'forest', 'ice', 'desert', 'ocean', 'pyramid')
LEVELS = ('easy', 'normal', 'hard', 'brutal')
LIMIT = 10


def legacy_id(score):
    return 'legacy:' + ':'.join(str(v) for v in [score['totalMs'], *score['lapsMs'], score['points']])


def board_key(map_id, difficulty):
    if map_id not in MAPS or difficulty not in LEVELS:
        raise ValueError('Choose a valid circuit and difficulty.')
    return map_id + ':' + difficulty


def validate_score(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid race result.')
    board_key(data.get('map'), data.get('difficulty'))
    name = data.get('name')
    if not isinstance(name, str):
        raise ValueError('Enter your racing name.')
    name = ' '.join(name.split())
    if not 1 <= len(name) <= 24 or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError('Use a racing name of 1–24 characters.')
    laps = data.get('lapsMs')
    if not isinstance(laps, list) or len(laps) != 3:
        raise ValueError('Finish all three laps before saving a time.')
    for value in [data.get('totalMs'), *laps]:
        if isinstance(value, bool) or not isinstance(value, int) or not 0 < value <= 86400000:
            raise ValueError('Invalid race time.')
    if abs(sum(laps) - data['totalMs']) > 5:
        raise ValueError('Lap times do not match the race time.')
    points = data.get('points', 0)
    if isinstance(points, bool) or not isinstance(points, int) or not 0 <= points <= 100000:
        raise ValueError('Invalid points.')
    run_id = data.get('runId')
    if run_id is not None and (not isinstance(run_id, str) or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', run_id)):
        raise ValueError('Invalid race identifier.')
    return dict(map=data['map'], difficulty=data['difficulty'], name=name,
                totalMs=data['totalMs'], bestLapMs=min(laps), lapsMs=laps, points=points,
                recordedAt=datetime.now(timezone.utc).isoformat(),
                runId=run_id or legacy_id(dict(totalMs=data['totalMs'], lapsMs=laps, points=points)))


def empty():
    return {'schema': 1, 'boards': {}, 'updatedAt': None}


def submitted_name(state, key, score):
    names = state.get('submissions', {}).get(key, {})
    found = names.get(score['runId']) or names.get(legacy_id(score))
    if found:
        return found
    return next((row['name'] for row in state['boards'].get(key, [])
                 if row.get('runId') == score['runId'] or not row.get('runId') and legacy_id(row) == legacy_id(score)), None)


def merge(state, score):
    state = copy.deepcopy(state)
    key = board_key(score['map'], score['difficulty'])
    rows = state['boards'].setdefault(key, [])
    submissions = state.setdefault('submissions', {}).setdefault(key, {})
    for row in rows:
        submissions.setdefault(row.get('runId') or legacy_id(row), row['name'])
    submissions[score['runId']] = score['name']
    previous = next((r for r in rows if r['name'].casefold() == score['name'].casefold()), None)
    improved = previous is None or score['totalMs'] < previous['totalMs']
    if improved:
        rows[:] = [r for r in rows if r['name'].casefold() != score['name'].casefold()]
        rows.append(score)
    elif previous['name'] != score['name']:
        previous['name'] = score['name']
    rows.sort(key=lambda r: (r['totalMs'], r['recordedAt'], r['name'].casefold()))
    state['updatedAt'] = score['recordedAt']
    return state, improved


class ScoreStore:
    def __init__(self, path=None, repo=None, token=None, branch=None, github_path=None):
        self.path = Path(path or os.environ.get('NEED4SPACE_SCOREBOARD_FILE', Path(__file__).parent / '.local' / 'scoreboard.json'))
        self.repo = repo or os.environ.get('NEED4SPACE_SCOREBOARD_REPO', '')
        self.token = token or os.environ.get('NEED4SPACE_SCOREBOARD_TOKEN', '')
        self.branch = branch or os.environ.get('NEED4SPACE_SCOREBOARD_BRANCH', 'scores')
        self.github_path = github_path or os.environ.get('NEED4SPACE_SCOREBOARD_PATH', 'leaderboard')
        if self.repo and (not re.fullmatch(r'[\w.-]+/[\w.-]+', self.repo) or not self.token):
            raise ValueError('GitHub storage needs a repository and a server-side token.')
        if self.repo and self.branch in ('main', 'master'):
            raise ValueError('Use a dedicated scores branch, separate from the game release.')
        self.lock = threading.Lock()

    @property
    def storage(self):
        return 'github' if self.repo else 'local'

    def github(self, method, resource, data=None):
        body = None if data is None else json.dumps(data).encode()
        request = urllib.request.Request('https://api.github.com/repos/' + self.repo + resource,
                                         data=body, method=method,
                                         headers={'Authorization': 'Bearer ' + self.token,
                                                  'Accept': 'application/vnd.github+json',
                                                  'X-GitHub-Api-Version': '2022-11-28',
                                                  'User-Agent': 'Need4Space-scoreboard',
                                                  'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    def _file_path(self, key):
        return '/contents/' + urllib.parse.quote(self.github_path.rstrip('/') + '/' + key.replace(':', '-') + '.json', safe='/')

    def _read(self, key):
        if not self.repo:
            return (json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else empty()), None
        path = self._file_path(key)
        try:
            file = self.github('GET', path + '?ref=' + urllib.parse.quote(self.branch, safe=''))
            if file.get('encoding') == 'none':
                blob = self.github('GET', '/git/blobs/' + file['sha'])
                return json.loads(base64.b64decode(blob['content'])), file['sha']
            return json.loads(base64.b64decode(file['content'])), file['sha']
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            return empty(), None

    def _ensure_branch(self):
        ref = '/git/ref/heads/' + urllib.parse.quote(self.branch, safe='')
        try:
            self.github('GET', ref)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            repo = self.github('GET', '')
            head = self.github('GET', '/git/ref/heads/' + urllib.parse.quote(repo['default_branch'], safe=''))
            try:
                self.github('POST', '/git/refs', {'ref': 'refs/heads/' + self.branch, 'sha': head['object']['sha']})
            except urllib.error.HTTPError as conflict:
                if conflict.code != 422:
                    raise
                self.github('GET', ref)

    def _board(self, state, key, name=None):
        rows = state['boards'].get(key, [])
        alias = ' '.join(name.split()).casefold() if isinstance(name, str) else None
        mine = next((dict(entry=row, rank=i + 1) for i, row in enumerate(rows) if row['name'].casefold() == alias), None)
        return {'entries': rows[:LIMIT], 'personal': mine, 'totalPlayers': len(rows), 'updatedAt': state['updatedAt'], 'storage': self.storage, 'limit': LIMIT}

    def read(self, map_id, difficulty, name=None):
        key = board_key(map_id, difficulty)
        with self.lock:
            state, _ = self._read(key)
            return self._board(state, key, name)

    def submit(self, data):
        score = validate_score(data)
        key = board_key(score['map'], score['difficulty'])
        with self.lock:
            if self.repo:
                self._ensure_branch()
            for attempt in range(5):
                state, sha = self._read(key)
                saved_name = submitted_name(state, key, score)
                if saved_name:
                    result = self._board(state, key, saved_name)
                    result.update(improved=False, rank=result['personal']['rank'] if result['personal'] else None,
                                  alreadySubmitted=True, submittedName=saved_name, runId=score['runId'])
                    return result
                changed, improved = merge(state, score)
                content = json.dumps(changed, ensure_ascii=False, indent=2) + '\n'
                if not self.repo:
                    self.path.parent.mkdir(parents=True, exist_ok=True)
                    temporary = self.path.with_suffix('.tmp')
                    temporary.write_text(content, encoding='utf-8')
                    os.replace(temporary, self.path)
                else:
                    payload = {'message': f'Scores: update {score["map"]} {score["difficulty"]}',
                               'content': base64.b64encode(content.encode()).decode(), 'branch': self.branch}
                    if sha:
                        payload['sha'] = sha
                    try:
                        self.github('PUT', self._file_path(key), payload)
                    except urllib.error.HTTPError as error:
                        if error.code not in (409, 422) or attempt == 4:
                            raise
                        continue
                result = self._board(changed, key, score['name'])
                result.update(improved=improved, rank=result['personal']['rank'], alreadySubmitted=False,
                              submittedName=score['name'], runId=score['runId'])
                return result
        raise RuntimeError('Could not save this time. Try again.')
