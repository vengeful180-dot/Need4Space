"""Persistence, ranking, concurrent saves and GitHub conflict checks."""
import base64
from concurrent.futures import ThreadPoolExecutor
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scoreboard import ScoreStore


def result(i=0, total=180000, map_id='space', difficulty='normal'):
    one = total // 3
    return dict(runId=str(uuid.uuid4()), name='Pilot ' + str(i), map=map_id, difficulty=difficulty,
                totalMs=total, lapsMs=[one, one, total - one * 2], points=42)


class ConflictStore(ScoreStore):
    def __init__(self):
        super().__init__(repo='owner/game', token='test-only')
        self.remote = None
        self.revision = 1
        self.conflict = True

    def github(self, method, resource, data=None):
        if resource.startswith('/git/ref/'):
            return {'object': {'sha': 'branch'}}
        if method == 'GET':
            if self.remote is None:
                raise urllib.error.HTTPError('https://api.github.com/test', 404, 'missing', {}, None)
            return {'content': base64.b64encode(json.dumps(self.remote).encode()).decode(), 'sha': str(self.revision)}
        if self.conflict:
            self.conflict = False
            from scoreboard import empty, merge, validate_score
            self.remote, _ = merge(empty(), validate_score(result(99, 175000)))
            self.revision += 1
            raise urllib.error.HTTPError('https://api.github.com/test', 409, 'concurrent save', {}, None)
        if data.get('sha') != str(self.revision):
            raise AssertionError('Update did not use the newest remote SHA')
        self.remote = json.loads(base64.b64decode(data['content']))
        self.revision += 1
        return {'commit': {'sha': str(self.revision)}}


class ScoreboardChecks(unittest.TestCase):
    def setUp(self):
        environment = patch.dict('os.environ', {'NEED4SPACE_SCOREBOARD_REPO': '', 'NEED4SPACE_SCOREBOARD_TOKEN': ''})
        environment.start()
        self.addCleanup(environment.stop)
        network = patch('urllib.request.urlopen', side_effect=AssertionError('Scoreboard tests must not access the network.'))
        network.start()
        self.addCleanup(network.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'scores.json'
        self.store = ScoreStore(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_top_ten_with_personal_time_outside_board(self):
        for i in range(13):
            self.store.submit(result(i, 180000 + i * 1000))
        board = self.store.read('space', 'normal', result(12)['name'])
        self.assertEqual(len(board['entries']), 10)
        self.assertEqual(board['totalPlayers'], 13)
        self.assertEqual(board['personal']['rank'], 13)
        self.assertEqual([e['name'] for e in board['entries']], ['Pilot ' + str(i) for i in range(10)])

    def test_slower_run_does_not_replace_best(self):
        self.store.submit(result(0))
        response = self.store.submit(result(0, 210000))
        self.assertFalse(response['improved'])
        self.assertEqual(response['personal']['entry']['totalMs'], 180000)
        better = result(0, 170000)
        better['name'] = 'PILOT 0'
        response = self.store.submit(better)
        self.assertEqual(response['entries'][0]['name'], better['name'])
        self.assertEqual(response['entries'][0]['totalMs'], 170000)

    def test_another_name_can_take_another_place(self):
        self.store.submit(result(0))
        another = result(0, 170000)
        another['name'] = '<b>Another name</b>'
        self.store.submit(another)
        self.assertEqual(self.store.read('space', 'normal')['totalPlayers'], 2)
        self.assertEqual(self.store.read('space', 'normal', 'Pilot 0')['personal']['entry']['totalMs'], 180000)

    def test_same_race_cannot_be_saved_under_another_name(self):
        score = result(0)
        self.store.submit(score)
        replay = self.store.submit({**score, 'name': 'Other name'})
        self.assertTrue(replay['alreadySubmitted'])
        self.assertEqual(replay['submittedName'], 'Pilot 0')
        self.assertEqual(replay['totalPlayers'], 1)

    def test_receipt_survives_a_faster_race_and_restart(self):
        first = result(0)
        self.store.submit(first)
        self.store.submit(result(0, 170000))
        replay = ScoreStore(self.path).submit({**first, 'name': 'Other name'})
        self.assertTrue(replay['alreadySubmitted'])
        self.assertEqual(replay['totalPlayers'], 1)
        self.assertEqual(replay['personal']['entry']['totalMs'], 170000)

    def test_concurrent_replay_only_keeps_one_name(self):
        score = result(0)
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(self.store.submit, [score, {**score, 'name': 'Other name'}]))
        self.assertEqual(sum(r['alreadySubmitted'] for r in replies), 1)
        self.assertEqual(self.store.read('space', 'normal')['totalPlayers'], 1)

    def test_legacy_record_does_not_gain_a_second_name(self):
        score = result(0)
        score.pop('runId')
        from scoreboard import empty, validate_score
        old = validate_score(score)
        old.pop('runId')
        state = empty()
        state['boards']['space:normal'] = [old]
        self.path.write_text(json.dumps(state))
        replay = self.store.submit({**score, 'name': 'Other name'})
        self.assertTrue(replay['alreadySubmitted'])
        self.assertEqual(replay['submittedName'], 'Pilot 0')
        self.assertEqual(replay['totalPlayers'], 1)

    def test_boards_are_separate_and_persist_after_restart(self):
        maps = ('space', 'forest', 'ice', 'desert', 'ocean', 'pyramid')
        levels = ('easy', 'normal', 'hard', 'brutal')
        for map_id in maps:
            for level in levels:
                self.store.submit(result(0, map_id=map_id, difficulty=level))
        fresh = ScoreStore(self.path)
        self.assertEqual(len(json.loads(self.path.read_text())['boards']), 24)
        for map_id in maps:
            for level in levels:
                with self.subTest(map=map_id, difficulty=level):
                    self.assertEqual(fresh.read(map_id, level)['entries'][0]['name'], 'Pilot 0')

    def test_parallel_saves_do_not_lose_players(self):
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(self.store.submit, [result(i, 180000 + i) for i in range(40)]))
        board = self.store.read('space', 'normal')
        self.assertEqual(board['totalPlayers'], 40)
        self.assertEqual(len(board['entries']), 10)

    def test_incomplete_or_invalid_race_is_not_saved(self):
        for field, value in [('lapsMs', [90000]), ('totalMs', -1), ('totalMs', float('nan')), ('name', ''), ('difficulty', 'unknown')]:
            invalid = result()
            invalid[field] = value
            with self.assertRaises(ValueError):
                self.store.submit(invalid)
        self.assertFalse(self.path.exists())

    def test_github_conflict_keeps_both_players(self):
        store = ConflictStore()
        response = store.submit(result(0))
        self.assertEqual(response['totalPlayers'], 2)
        self.assertEqual([r['name'] for r in response['entries']], ['Pilot 99', 'Pilot 0'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
