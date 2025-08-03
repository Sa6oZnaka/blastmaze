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
    },
    plugins: {
    scene: [
      {
        key: 'raycasterPlugin',
        plugin: PhaserRaycaster,
        mapping: 'raycasterPlugin'
      }
    ]
  }
};

let eventQueue = [];
let sceneCreated = false;

const TILE_SIZE = 90;
let GRID_WIDTH;
let GRID_HEIGHT;
const MOVE_DURATION = 150;

let grid;
let player;
let players = {};
let cursors;
let walls;
let bombs;


socket = io();
// map
socket.on('mapData', (mapData) => {

    grid = mapData.grid;
    GRID_WIDTH = mapData.width;
    GRID_HEIGHT = mapData.height;

    new Phaser.Game(config);
});

// players data
socket.on('currentPlayers', (serverPlayers) => {
    const handlePlayers = () => {
        for (const id in serverPlayers) {
            if (id !== socket.id) {
                addOtherPlayer(serverPlayers[id]);
            }
        }
    };

    if (sceneCreated) {
        handlePlayers();
    } else {
        eventQueue.push(handlePlayers);
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== socket.id) {
        const handleJoin = () => addOtherPlayer(data);
        if (sceneCreated) {
            handleJoin();
        } else {
            eventQueue.push(handleJoin);
        }
    }
});

socket.on('playerLeft', ({ id }) => {
    if (players[id]) {
        players[id].destroy();
        delete players[id];
    }
});

let mapGraphics;

let moving = false;
let moveTween = null;

let heldLeft = false;
let heldRight = false;
let heldUp = false;
let heldDown = false;

let visibleBlocks;
let blocksMap = {}; 

function preload() {

    this.load.image('block', 'https://labs.phaser.io/assets/sprites/block.png');

    // Light gradeint
    const size = TILE_SIZE * 7;
    const rt = this.textures.createCanvas('lightGradient', size, size);
    const ctx = rt.getContext();

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    rt.refresh();
}


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

    bombs = this.add.group();
    this.input.keyboard.on('keydown-SPACE', () => {
        placeBomb.call(this);
    });

    this.cameras.main.startFollow(player);
    this.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    this.physics.world.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

    // Light
    this.darkness = this.make.renderTexture({
        width: this.cameras.main.width * 2,
        height: this.cameras.main.height * 2,
        add: true
    });
    this.darkness.setDepth(10);
    this.darkness.setScrollFactor(0);

    this.fpsText = this.add.text(10, 10, '', {
        font: '16px Arial',
        fill: '#ffffff'
    })
    .setScrollFactor(0)
    .setDepth(100);

    // Visible blocks from raycaster
    visibleBlocks = this.physics.add.staticGroup();
    this.renderedCells = new Set();

    // TODO fix collider
    //this.physics.add.collider(this.player, this.visibleBlocks);
    this.cursors = this.input.keyboard.createCursorKeys();

    // Raycaster
    this.raycaster = this.raycasterPlugin.createRaycaster();
    //this.raycaster.setBoundingBox(0, 0, this.worldCols * this.gridSize, this.worldRows * this.gridSize);
    this.ray = this.raycaster.createRay({ origin: this.player, autoSlice: true });

    this.lightGraphics = this.add.graphics({ fillStyle: { color: 0xffffaa, alpha: 0.3 } });
    createLightGradientTexture(this);

    updateVisibleBlocks(this);

    // Socket events after scene is created
    sceneCreated = true;
    for (const evt of eventQueue) {
        evt();
    }
    eventQueue = [];
}

function update() {
    // FPS
    const fps = Math.floor(this.game.loop.actualFps);
    this.fpsText.setText(`FPS: ${fps}`);

    // Update the raycaster
    updateRaycaster.call(this);

    // Light gradeint
    updateLightGradient.call(this);

    // Movement
    if (moving) return;

    if (heldLeft && tryMove(-1, 0)) return;
    if (heldRight && tryMove(1, 0)) return;
    if (heldUp && tryMove(0, -1)) return;
    if (heldDown && tryMove(0, 1)) return;
}

function updateLightGradient() {
    this.darkness.clear();
    this.darkness.fill(0x000000, 1);

    const camView = this.cameras.main.worldView;
    const playerCamX = player.x - camView.x + this.cameras.main.width;
    const playerCamY = player.y - camView.y + this.cameras.main.height;

    const light = this.add.image(playerCamX, playerCamY, 'lightGradient').setScale(2).setAlpha(1);
    this.darkness.erase(light);
    light.destroy();
}

function updateVisibleBlocks() {
    const radius = 10;

    // if its called before initiated
    if(!visibleBlocks)
        return;

    const startX = Math.max(0, player.gridX - radius);
    const endX = Math.min(GRID_WIDTH, player.gridX + radius + 1);
    const startY = Math.max(0, player.gridY - radius);
    const endY = Math.min(GRID_HEIGHT, player.gridY + radius + 1);

    // Add Visible
    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {

            if(grid[y][x] == 1){

                const key = `${x}_${y}`;

                if (!blocksMap[key]) {
                    const block = visibleBlocks.create(x * TILE_SIZE, y * TILE_SIZE, 'block')
                        .setOrigin(0)
                        .setDisplaySize(TILE_SIZE, TILE_SIZE);
                    block.refreshBody();
                    blocksMap[key] = block;
                }
            }
        }
    }

    for (const key in blocksMap) {
        const [bx, by] = key.split('_').map(Number);
        if (bx < startX || bx >= endX || by < startY || by >= endY) {
            this.raycaster.removeMappedObjects(blocksMap[key]);
            blocksMap[key].destroy();
            delete blocksMap[key];
        }
    }
}

function updateRaycaster() {
    
    this.raycaster.mapGameObjects(visibleBlocks.getChildren(), true);
    this.ray.setOrigin(player.x, player.y);
    const intersections = this.ray.castCircle();

    this.lightGraphics.clear();
    if (intersections.length > 0) {
      this.lightGraphics.fillPoints(intersections, true);
    }

    const cam = this.cameras.main;
    const buffer = 50; // buffer zone
    
    const fromX = cam.scrollX - buffer;
    const fromY = cam.scrollY - buffer;
    const toX = cam.width + buffer * 2;
    const toY = cam.height + buffer * 2;

    this.raycaster.setBoundingBox(fromX , fromY, toX, toY);
}

function tryMove(dx, dy) {
    const newX = player.gridX + dx;
    const newY = player.gridY + dy;

    if (isInsideGrid(newX, newY) && grid[newY][newX] === 0) {
        moving = true;

        socket.emit('move', { dx, dy });

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
                updateVisibleBlocks.call(player.scene);
            }
        });

        return true;
    }
    return false;
}

socket.on('playerMoved', ({ id, x, y }) => {
    if (id === socket.id) return;
    const other = players[id];
    if (!other) return;

    const worldX = x * TILE_SIZE + TILE_SIZE / 2;
    const worldY = y * TILE_SIZE + TILE_SIZE / 2;

    player.scene.tweens.add({
        targets: other,
        x: worldX,
        y: worldY,
        duration: MOVE_DURATION,
        ease: 'Linear'
    });
});


function isInsideGrid(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function placeBomb() {
    socket.emit('placeBomb');

/*
    const bombX = player.gridX * TILE_SIZE + TILE_SIZE / 2;
    const bombY = player.gridY * TILE_SIZE + TILE_SIZE / 2;

    const bomb = this.add.circle(bombX, bombY, 20, 0xff0000);
    bomb.setDepth(1);

    bombs.add(bomb);

    // This should be on the sever
    this.time.delayedCall(3000, () => {
        explodeBomb(bomb);
    });*/
}

socket.on('bombPlaced', ({ id, x, y }) => {
    const bomb = player.scene.add.circle(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        20,
        0xff0000
    );
    bombs.add(bomb);
    bomb.setDepth(1);
});

socket.on('bombExploded', ({ x, y }) => {
    const bombGridX = x;
    const bombGridY = y;

    const scene = player.scene;

    const explosion = scene.add.image(
        bombGridX * TILE_SIZE + TILE_SIZE / 2,
        bombGridY * TILE_SIZE + TILE_SIZE / 2,
        'explosionGradient'
    );
    explosion.setDepth(110);
    explosion.setScale(10);
    explosion.setAlpha(1);

    scene.tweens.add({
        targets: explosion,
        scaleX: 1,
        scaleY: 1,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeOut',
        onComplete: () => {
            explosion.destroy();
        }
    });

    for (let y2 = bombGridY - 1; y2 <= bombGridY + 1; y2++) {
        for (let x2 = bombGridX - 1; x2 <= bombGridX + 1; x2++) {
            if (isInsideGrid(x2, y2) && grid[y2][x2] === 1) {
                grid[y2][x2] = 0;

                const key = `${x2}_${y2}`;
                if (blocksMap[key]) {
                    scene.raycaster.removeMappedObjects(blocksMap[key]);
                    blocksMap[key].destroy();
                    delete blocksMap[key];
                }
            }
        }
    }
});

function createLightGradientTexture(scene) {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255, 170, 0, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 170, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 170, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    scene.textures.addBase64('explosionGradient', canvas.toDataURL());
}

function addOtherPlayer(data) {
    const other = player.scene.add.rectangle(
        data.x * TILE_SIZE + TILE_SIZE / 2,
        data.y * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE - 6,
        TILE_SIZE - 6,
        0x44ff44
    );
    players[data.id] = other;
}
