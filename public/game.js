const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
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

const TILE_SIZE = 40;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const PLAYER_SPEED = 160;

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

function preload() {}

function create() {
    walls = this.physics.add.staticGroup();

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const cell = grid[y][x];
            const posX = x * TILE_SIZE + TILE_SIZE / 2;
            const posY = y * TILE_SIZE + TILE_SIZE / 2;

            if (cell === 1) {
                // TODO Add sprite
                /*walls.create(posX, posY, null)
                    .setSize(TILE_SIZE - 2, TILE_SIZE - 2)
                    .setOrigin(0.5)
                    .setDisplaySize(TILE_SIZE - 2, TILE_SIZE - 2)
                    .setFillStyle?.(0x666666);*/

                const wall = this.add.rectangle(posX, posY, TILE_SIZE - 2, TILE_SIZE - 2, 0x0044ff);
                this.physics.add.existing(wall, true);
                walls.add(wall);
            } else {
                this.add.rectangle(posX, posY, TILE_SIZE - 2, TILE_SIZE - 2, 0x444444);
            }
        }
    }

    player = this.add.rectangle(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE - 6, TILE_SIZE - 6, 0xbbbbbb);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);

    this.physics.add.collider(player, walls);

    cursors = this.input.keyboard.addKeys({
        up: 'W',
        down: 'S',
        left: 'A',
        right: 'D'
    });
}

function update() {
    const body = player.body;
    body.setVelocity(0);

    if (cursors.left.isDown) body.setVelocityX(-PLAYER_SPEED);
    else if (cursors.right.isDown) body.setVelocityX(PLAYER_SPEED);

    if (cursors.up.isDown) body.setVelocityY(-PLAYER_SPEED);
    else if (cursors.down.isDown) body.setVelocityY(PLAYER_SPEED);

    body.velocity.normalize().scale(PLAYER_SPEED);
}

new Phaser.Game(config);
