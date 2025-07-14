const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a1a',
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: {
        preload,
        create,
        update
    }
};

const TILE_SIZE = 90;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const MOVE_DURATION = 150;

const grid = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0],
  [0,0,0,0,1,0,1,0,1,1,0,0,1,0,1,0,0,0,0,0],
  [0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,1,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,0,1,1,1,1,0,0,0,1,0,0,1,0,0],
  [0,1,0,1,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,1,0,0,0,0,0,1,1,0,0,0,0,1,0,0,0,0],
  [0,0,0,0,0,1,1,1,0,0,0,0,1,0,0,0,1,1,0,0],
  [0,0,1,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0],
  [0,0,1,0,1,1,0,0,0,1,0,0,0,0,0,0,0,0,1,0],
  [0,0,0,0,0,0,0,1,0,0,0,1,0,0,1,0,0,0,0,0],
  [0,1,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

let player;
let cursors;
let walls;

let moving = false;
let moveTween = null;

let heldLeft = false;
let heldRight = false;
let heldUp = false;
let heldDown = false;

function preload() {}

function create() {
    walls = this.physics.add.staticGroup();

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const cell = grid[y][x];
            const posX = x * TILE_SIZE + TILE_SIZE / 2;
            const posY = y * TILE_SIZE + TILE_SIZE / 2;

            if (cell === 1) {
                const wall = this.add.rectangle(posX, posY, TILE_SIZE - 2, TILE_SIZE - 2, 0x0044ff);
                this.physics.add.existing(wall, true);
                walls.add(wall);
            } else {
                this.add.rectangle(posX, posY, TILE_SIZE - 2, TILE_SIZE - 2, 0x444444);
            }
        }
    }

    player = this.add.rectangle(0, 0, TILE_SIZE - 6, TILE_SIZE - 6, 0xbbbbbb);
    player.gridX = 0;
    player.gridY = 0;
    player.x = player.gridX * TILE_SIZE + TILE_SIZE / 2;
    player.y = player.gridY * TILE_SIZE + TILE_SIZE / 2;

    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);

    cursors = this.input.keyboard.addKeys({
        up: 'W',
        down: 'S',
        left: 'A',
        right: 'D'
    });

    this.input.keyboard.on('keydown-A', () => { heldLeft = true; });
    this.input.keyboard.on('keyup-A', () => { heldLeft = false; });

    this.input.keyboard.on('keydown-D', () => { heldRight = true; });
    this.input.keyboard.on('keyup-D', () => { heldRight = false; });

    this.input.keyboard.on('keydown-W', () => { heldUp = true; });
    this.input.keyboard.on('keyup-W', () => { heldUp = false; });

    this.input.keyboard.on('keydown-S', () => { heldDown = true; });
    this.input.keyboard.on('keyup-S', () => { heldDown = false; });

    this.cameras.main.startFollow(player);
    this.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    this.physics.world.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
}

function update() {
    if (moving) return;

    if (heldLeft) {
        if (tryMove(-1, 0)) return;
    }
    if (heldRight) {
        if (tryMove(1, 0)) return;
    }
    if (heldUp) {
        if (tryMove(0, -1)) return;
    }
    if (heldDown) {
        if (tryMove(0, 1)) return;
    }
}

function tryMove(dx, dy) {
    const newX = player.gridX + dx;
    const newY = player.gridY + dy;

    if (isInsideGrid(newX, newY) && grid[newY][newX] === 0) {
        moving = true;

        moveTween = player.scene.tweens.add({
            targets: player,
            x: newX * TILE_SIZE + TILE_SIZE / 2,
            y: newY * TILE_SIZE + TILE_SIZE / 2,
            duration: MOVE_DURATION,
            ease: 'Linear',
            onComplete: () => {
                player.gridX = newX;
                player.gridY = newY;
                moving = false;
            }
        });

        return true;
    }
    return false;
}

function isInsideGrid(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

new Phaser.Game(config);
