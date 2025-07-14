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
let GRID_WIDTH;
let GRID_HEIGHT;
const MOVE_DURATION = 150;

let grid;

socket = io();
socket.on('mapData', (mapData) => {

    grid = mapData.grid;
    GRID_WIDTH = mapData.width;
    GRID_HEIGHT = mapData.height;

    new Phaser.Game(config);
});

let player;
let cursors;
let walls;

let mapGraphics;

let moving = false;
let moveTween = null;

let heldLeft = false;
let heldRight = false;
let heldUp = false;
let heldDown = false;

function preload() {}

function create() {
    walls = this.physics.add.staticGroup();
    mapGraphics = this.add.graphics();
    mapGraphics.setDepth(-1); // да е зад всички обекти
    mapGraphics.setScrollFactor(1);

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

    drawVisibleTiles.call(this);

}

function update() {
    // Movement
    if (moving) return;

    if (heldLeft && tryMove(-1, 0)) return;
    if (heldRight && tryMove(1, 0)) return;
    if (heldUp && tryMove(0, -1)) return;
    if (heldDown && tryMove(0, 1)) return;
}

function drawVisibleTiles() {
    const radius = 10;
    const startX = Math.max(0, player.gridX - radius);
    const endX = Math.min(GRID_WIDTH, player.gridX + radius + 1);
    const startY = Math.max(0, player.gridY - radius);
    const endY = Math.min(GRID_HEIGHT, player.gridY + radius + 1);

    mapGraphics.clear();

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const cell = grid[y][x];
            const posX = x * TILE_SIZE;
            const posY = y * TILE_SIZE;

            mapGraphics.fillStyle(cell === 1 ? 0x0044ff : 0x444444, 1);
            mapGraphics.fillRect(posX, posY, TILE_SIZE - 2, TILE_SIZE - 2);
        }
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
                drawVisibleTiles.call(player.scene); // 👈 тук
            }
        });

        return true;
    }
    return false;
}

function isInsideGrid(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}


