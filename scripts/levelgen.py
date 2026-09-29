#!/usr/bin/env python3
"""Authoring helper used to paint the level JSON files. Not needed at runtime."""
import json, sys

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [['#'] * w for _ in range(h)]
    def rect(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g[y][x] = ch
    def put(self, x, y, ch):
        self.g[y][x] = ch
    def rows(self):
        return [''.join(r) for r in self.g]

def save(path, data):
    json.dump(data, open(path, 'w'), indent=2)
    print('\n'.join(f'{i:2d} ' + r for i, r in enumerate(data['map'])))
    print('   ' + ''.join(str(x % 10) for x in range(len(data['map'][0]))))

def level1():
    c = Canvas(36, 11)
    c.rect(1, 3, 6, 9, ',')            # start room (carpet)
    c.rect(7, 6, 12, 6, '.')           # corridor
    c.rect(13, 3, 24, 9, '.')          # hall (stone)
    c.rect(19, 1, 21, 2, '.')          # alcove: a place to throw a pebble
    c.rect(25, 6, 28, 6, '.')          # doorway + corridor
    c.rect(29, 3, 34, 9, '.')          # artifact room
    c.put(2, 6, 'S')
    c.put(30, 4, 'A')
    c.put(33, 8, 'X')
    return {
        "id": "01-first-steps", "name": "FIRST STEPS",
        "hint": [
            "WASD MOVES. EVERY STEP SENDS OUT A PULSE THAT LIGHTS THE DARK",
            "HOLD SHIFT TO SNEAK: QUIET, TINY PULSE. SPACE RUNS: LOUD",
            "CARPET IS SOFT, STONE IS LOUDER. GUARDS ARE BLIND BUT HEAR YOU",
            "CLICK TO THROW A PEBBLE. GUARDS INVESTIGATE WHERE IT LANDS",
            "STEAL THE ARTIFACT, THEN REACH THE EXIT. R RESTARTS"],
        "pebbles": 4, "ranks": {"S": 30, "A": 55, "B": 90},
        "map": c.rows(),
        "guards": [{"path": [[24, 6]]}],
    }

def level2():
    c = Canvas(38, 17)
    c.rect(1, 11, 6, 15, ',')          # start room (carpet)
    c.put(7, 13, '.')                  # door
    c.rect(8, 3, 8, 15, '=')           # west corridor (metal)
    c.rect(8, 3, 30, 3, '=')           # north corridor (metal)
    c.rect(30, 3, 30, 15, '=')         # east corridor (metal)
    c.rect(9, 15, 29, 15, '.')         # south corridor (stone)
    # pockets to hide in
    c.rect(12, 13, 12, 14, '.')
    c.rect(26, 13, 26, 14, '.')
    c.rect(13, 1, 13, 2, '=')
    c.rect(25, 1, 25, 2, '=')
    # central vault
    c.rect(13, 5, 25, 11, '.')
    for (x, y) in [(16, 7), (22, 7), (16, 9), (22, 9)]:
        c.put(x, y, '#')
    c.rect(19, 4, 19, 4, '=')          # north door
    c.rect(19, 12, 19, 14, '.')        # south passage
    c.rect(26, 8, 29, 8, '=')          # east passage
    c.put(19, 8, 'A')
    # exit room
    c.rect(32, 5, 36, 11, ',')
    c.put(31, 8, '.')
    c.put(34, 8, 'X')
    c.put(3, 13, 'S')
    return {
        "id": "02-cold-iron", "name": "COLD IRON",
        "hint": [
            "METAL RINGS LOUD. CARPET IS SOFT. SNEAK ON METAL",
            "GUARDS PATROL THE RING. HIDE IN A POCKET AND LET THEM PASS",
            "A PEBBLE ON METAL CLANGS LOUD: LURE A GUARD AWAY FROM YOUR ROUTE",
            "STANDING STILL MAKES NO SOUND"],
        "pebbles": 3, "ranks": {"S": 35, "A": 65, "B": 110},
        "map": c.rows(),
        "guards": [
            {"path": [[10, 3], [30, 3], [30, 13], [30, 3]], "pause": 1.5},
            {"path": [[14, 15], [28, 15]], "mode": "pingpong", "pause": 1},
        ],
    }

def level3():
    c = Canvas(40, 19)
    # west half
    c.rect(1, 13, 5, 17, ',')          # start room (carpet)
    c.put(6, 15, '.')
    c.rect(7, 15, 14, 15, '.')         # start corridor
    c.rect(10, 7, 10, 14, '.')         # side corridor up to the hall
    c.rect(8, 2, 16, 6, '.')           # north-west hall
    c.rect(15, 7, 16, 16, '.')         # west bank strip
    for (x, y) in [(10, 4), (13, 4)]:
        c.put(x, y, '#')
    c.rect(8, 1, 8, 1, '.')            # bell nook
    # river
    c.rect(17, 1, 20, 17, '~')
    # east bank strip
    c.rect(21, 1, 23, 17, '.')
    # gate
    c.rect(24, 9, 26, 9, '.')
    # vault
    c.rect(27, 2, 37, 7, '.')          # north hall (artifact)
    c.rect(28, 3, 36, 6, '~')          # moat
    c.rect(27, 8, 32, 10, '.')         # choke band
    c.rect(27, 11, 37, 16, '.')        # south hall (exit)
    c.rect(29, 13, 33, 14, '=')        # metal grating
    c.put(34, 4, 'A')
    c.put(35, 15, 'X')
    c.put(3, 15, 'S')
    return {
        "id": "03-drowned-vault", "name": "DROWNED VAULT",
        "hint": [
            "WATER SPLASHES LOUD. SNEAK THROUGH IT, KEEP AWAY FROM GUARDS",
            "THE GATE GUARD BLOCKS THE ONLY DOOR: LURE HIM WITH A PEBBLE",
            "PRESS E TO RING THE BELL: MAPS EVERYTHING, BUT EVERY GUARD COMES",
            "BELL PLUS A HIDING SPOT CLEARS THE CHOKE POINTS"],
        "pebbles": 3, "ranks": {"S": 50, "A": 90, "B": 150},
        "map": c.rows(),
        "guards": [
            {"path": [[16, 3], [16, 14]], "mode": "pingpong", "pause": 1},
            {"path": [[25, 9]]},
            {"path": [[29, 5], [36, 5], [36, 13], [29, 13]], "pause": 1},
        ],
    }

if __name__ == '__main__':
    which = sys.argv[1]
    if which == '1':
        save('src/levels/01-first-steps.json', level1())
    if which == '2':
        save('src/levels/02-cold-iron.json', level2())
    if which == '3':
        save('src/levels/03-drowned-vault.json', level3())
