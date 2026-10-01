// Pixel art, drawn in text. '.' is transparent; letters are palette colours.
// All original: Sammy follows the descriptions of the Apple II sprite (tubby,
// huge orange bouffant, big nose and moustache, white top, blue legs).

export const PALETTE_KEYS = ['o', 'w', 'b', 'g', 'v', 'k'];

const HEAD = [
  '....oooo....',
  '..ooooooo...',
  '.ooooooooo..',
  '.oooooooooo.',
  '.ooooooooo..',
  '..ooowwww...',
  '..oowwwkww..',
  '..oowwwwwww.',
  '...wwwwwww..',
  '...wwoooo...',
];

const HEAD_BALD = [
  '............',
  '............',
  '............',
  '............',
  '....wwww....',
  '...wwwwww...',
  '...wkwwkww..',
  '...wwwwwwww.',
  '...wwwwwww..',
  '...wwoooo...',
];

const BODY_STAND = [
  '...wwwwww...',
  '..wwwwwwww..',
  '.wwwwwwwwww.',
  '.ww.wwww.ww.',
  '....wwww....',
  '...bbbbbb...',
  '...bbbbbb...',
  '...bb..bb...',
  '...bb..bb...',
  '..bbb..bbb..',
];

const BODY_WALK1 = [
  '...wwwwww...',
  '..wwwwwwww..',
  '.wwwwwwwwww.',
  'ww..wwww..ww',
  '....wwww....',
  '...bbbbbb...',
  '..bbb..bbb..',
  '.bbb....bbb.',
  '.bb......bb.',
  'bbb......bbb',
];

const BODY_WALK2 = [
  '...wwwwww...',
  '..wwwwwwww..',
  '..wwwwwwww..',
  '..w.wwww.w..',
  '....wwww....',
  '....bbbb....',
  '....bbbb....',
  '....bbbb....',
  '....bbb.....',
  '...bbbb.....',
];

const BODY_JUMP = [
  'w..wwwwww..w',
  'ww.wwwwww.ww',
  '.wwwwwwwwww.',
  '...wwwwww...',
  '....wwww....',
  '..bbbbbbbb..',
  '.bbb....bbb.',
  '.bb......bb.',
  '............',
  '............',
];

const BODY_HANG = [
  '...wwwwww...',
  '...wwwwww...',
  '...wwwwww...',
  '...wwwwww...',
  '....wwww....',
  '...bbbbbb...',
  '...bb..bb...',
  '...bb..bb...',
  '...bb..bb...',
  '...b....b...',
];

export const SPRITES = {
  sammyStand: [...HEAD, ...BODY_STAND],
  sammyWalk1: [...HEAD, ...BODY_WALK1],
  sammyWalk2: [...HEAD, ...BODY_WALK2],
  sammyJump: [...HEAD, ...BODY_JUMP],
  sammyHang: [...HEAD, ...BODY_HANG],
  sammyBald: [...HEAD_BALD, ...BODY_STAND],
  hair: HEAD.slice(0, 5),
  life: [
    '.ooo.',
    'ooooo',
    '.www.',
    '.www.',
    '.b.b.',
  ],
  pumpkin: [
    '......gg......',
    '...oooooooo...',
    '.oo........oo.',
    'o...oo..oo...o',
    'o...oo..oo...o',
    'o............o',
    'o..o.o..o.o..o',
    'o...oooooo...o',
    '.oo........oo.',
    '...oooooooo...',
  ],
  ball: [
    '...wwwww...',
    '..wwwwwww..',
    '.ww..wwwww.',
    'ww.wwwwwwww',
    'ww.wwwwwwww',
    'wwwwwwwwwww',
    'wwwwwwwwwww',
    'wwwwwwwwwww',
    '.wwwwwwwww.',
    '..wwwwwww..',
    '...wwwww...',
  ],
  ballSmiley: [
    '...ggggg...',
    '..ggggggg..',
    '.ggggggggg.',
    'ggg.ggg.ggg',
    'ggg.ggg.ggg',
    'ggggggggggg',
    'gg.ggggg.gg',
    'ggg.....ggg',
    '.ggggggggg.',
    '..ggggggg..',
    '...ggggg...',
  ],
  ballDotted: [
    '...wwwww...',
    '..ww.wwww..',
    '.wwwwww.ww.',
    'w.wwwwwwwww',
    'wwww.wwww.w',
    'wwwwwwwwwww',
    'ww.wwww.www',
    'wwwwwwwwwww',
    '.www.wwww..',
    '..wwwww.w..',
    '...wwwww...',
  ],
  arrowUp: [
    '...w...',
    '..www..',
    '.wwwww.',
    'wwwwwww',
    '..www..',
    '..www..',
    '..www..',
  ],
};
