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

const TILE_SIZE = 70;
let GRID_WIDTH;
let GRID_HEIGHT;
const MOVE_DURATION = 150;

// notifications
let deathNotifications = []; 
const NOTIF_DURATION = 5000;
const NOTIF_FADE_DURATION = 800;
const NOTIF_SPACING = 34;
const NOTIF_X = 20;
const NOTIF_Y = 20;

let grid;
let player;
let players = {};
let cursors;
let walls;
let bombs;
let items;

let bombPrevew = false;

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
    console.log("Player " + id + " died!");

    if (players[id]) {
        players[id].destroy();
        delete players[id];
    }

    let text = "Player " + id + " died";
    if (sceneCreated && player && player.scene) {
        showDeathNotification(player.scene, text);
    } else {
        // ако сцената не е готова, пусни събитие в опашката
        eventQueue.push(() => {
            if (player && player.scene) showDeathNotification(player.scene, text);
        });
    }
});

socket.on('playerDied', () => {
    const scene = player.scene;

    const deadText = scene.add.text(
        scene.cameras.main.worldView.x + scene.cameras.main.width / 2,
        scene.cameras.main.worldView.y + scene.cameras.main.height / 2,
        'DEAD',
        {
            font: '64px Arial',
            fill: '#ff0000',
            stroke: '#000',
            strokeThickness: 6
        }
    );
    deadText.setOrigin(0.5);
    deadText.setDepth(200);

    canMove = false;
});

socket.on('itemSpawned', (item) => {
    const scene = player.scene;

    const sprite = scene.add.rectangle(
        item.x * TILE_SIZE + TILE_SIZE / 2,
        item.y * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE * 0.6,
        TILE_SIZE * 0.6,
        item.type === "speed" ? 0x00aaff : 0xffaa00
    );

    sprite.setDepth(5);
    sprite.itemId = item.id;
    sprite.itemType = item.type;

    items.add(sprite);
});

socket.on('itemPicked', ({ playerId, itemId, type }) => {
    const scene = player.scene;

    const child = items.getChildren().find(c => c.itemId === itemId);
    if (child) {
        child.destroy();
        items.remove(child);
    }

    if (playerId === socket.id) {
        let msg = "Picked up " + type;

        if(type == "bomb"){
            bombPrevew = true;
        }

        showDeathNotification(scene, msg);
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
let heldSpace = false;

let canMove = true;

let visibleBlocks;
let blocksMap = {}; 

function preload() {

    this.load.image('block', './assets/block.png');
    this.load.image('block2', './assets/block2.png');
        this.load.spritesheet('bomb', 'assets/bomb.png', {
        frameWidth: 90, 
        frameHeight: 90
    });



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

    this.input.keyboard.on('keydown-SPACE', () => { heldSpace = true; });
    this.input.keyboard.on('keyup-SPACE', () => { heldSpace = false; });

    bombs = this.add.group();
    /*this.input.keyboard.on('keydown-SPACE', () => {
        placeBomb.call(this);
    });*/
    items = this.add.group();

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
    if(!canMove) return;

    if (moving) return;

    if(heldSpace)
        placeBomb.call(this);

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

            if(grid[y][x] == 2){

                const key = `${x}_${y}`;

                if (!blocksMap[key]) {
                    const block = visibleBlocks.create(x * TILE_SIZE, y * TILE_SIZE, 'block2')
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

                checkItemPickup();
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
}

socket.on('bombPlaced', ({ id, x, y }) => {
    const bomb = player.scene.add.sprite(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        'bomb',
        0
    );

    bomb.displayWidth = TILE_SIZE;
    bomb.displayHeight = TILE_SIZE;

    bombs.add(bomb);
    bomb.setDepth(1);

    player.scene.time.delayedCall(600, () => {
        bomb.setFrame(1);
    });

    player.scene.time.delayedCall(1200, () => {
        bomb.setFrame(2);
    });

    player.scene.time.delayedCall(1800, () => {
        bomb.setFrame(3);
    });

    if(bombPrevew){
        const affected = previewExplosion(x, y);
        affected.forEach(({ x: ax, y: ay }) => {
            const cx = ax * TILE_SIZE;
            const cy = ay * TILE_SIZE;
            const previewTile = player.scene.add.rectangle(
                cx + TILE_SIZE / 2,
                cy + TILE_SIZE / 2,
                TILE_SIZE,
                TILE_SIZE,
                0xffff00,
                0.3
            );
            previewTile.setDepth(0);
            
            bomb.previewTiles = bomb.previewTiles || [];
            bomb.previewTiles.push(previewTile);
        });
    }
});

socket.on('bombExploded', ({ x, y, affected }) => {
    const scene = player.scene;

    const children = [...bombs.getChildren()];
    for (const bomb of children) {
        const bx = Math.floor((bomb.x - TILE_SIZE / 2) / TILE_SIZE);
        const by = Math.floor((bomb.y - TILE_SIZE / 2) / TILE_SIZE);

        if (affected.some(cell => cell.x === bx && cell.y === by)) {
            bombs.remove(bomb, true, true);
        }
    }

    affected.forEach(({ x, y }) => {
        const cx = x * TILE_SIZE + TILE_SIZE / 2;
        const cy = y * TILE_SIZE + TILE_SIZE / 2;

        const explosion = scene.add.image(cx, cy, 'explosionGradient');
        explosion.setDepth(110);
        explosion.setScale(0.5);
        explosion.setAlpha(1);

        scene.tweens.add({
            targets: explosion,
            scaleX: 1.5,
            scaleY: 1.5,
            alpha: 0,
            duration: 500,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                explosion.destroy();
            }
        });

        if (isInsideGrid(x, y) && grid[y][x] === 1) {
            grid[y][x] = 0;

            const key = `${x}_${y}`;
            const block = blocksMap[key];

            if (block) {
                scene.tweens.add({
                    targets: block,
                    tint: 0xff5555,
                    scaleX: 0.8,
                    scaleY: 0.8,
                    alpha: 0,
                    duration: 200,
                    ease: 'Cubic.easeIn',
                    onComplete: () => {
                        scene.raycaster.removeMappedObjects(block);
                        block.destroy();
                        delete blocksMap[key];
                    }
                });
            }
        }
    });

    // remove prevew
    for (const bomb of children) {
        const bx = Math.floor((bomb.x - TILE_SIZE / 2) / TILE_SIZE);
        const by = Math.floor((bomb.y - TILE_SIZE / 2) / TILE_SIZE);

        if (affected.some(cell => cell.x === bx && cell.y === by)) {
            if (bomb.previewTiles) {
                bomb.previewTiles.forEach(tile => tile.destroy());
                bomb.previewTiles = [];
            }
            bombs.remove(bomb, true, true);
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

function previewExplosion(x, y) {
    const affected = new Set();
    const directions = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
    ];
    const radius = 3;

    affected.add(`${x},${y}`);

    for (const { dx, dy } of directions) {
        for (let step = 1; step <= radius; step++) {
            const nx = x + dx * step;
            const ny = y + dy * step;

            if (!isInsideGrid(nx, ny)) break;

            if (grid[ny][nx] === 1) { // destructible block – спира
                affected.add(`${nx},${ny}`);
                break;
            } else if (grid[ny][nx] === 0) { // празно
                affected.add(`${nx},${ny}`);
            } else {
                break; // indestructible block
            }
        }
    }

    return [...affected].map(str => {
        const [ax, ay] = str.split(',').map(Number);
        return { x: ax, y: ay };
    });
}

function showDeathNotification(scene, text) {
    const txt = scene.add.text(NOTIF_X, NOTIF_Y + deathNotifications.length * NOTIF_SPACING, text, {
        font: '20px Arial',
        fill: '#ff4444',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'left'
    }).setScrollFactor(0).setDepth(300);

    const entry = {
        textObj: txt,
        timeout: null,
        fadeTween: null
    };

    deathNotifications.push(entry);

    entry.timeout = scene.time.delayedCall(NOTIF_DURATION, () => {
        entry.fadeTween = scene.tweens.add({
            targets: entry.textObj,
            alpha: 0,
            duration: NOTIF_FADE_DURATION,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                removeDeathNotification(scene, entry);
            }
        });
    });
}

function removeDeathNotification(scene, entry) {
    const idx = deathNotifications.indexOf(entry);
    if (idx === -1) return;

    if (entry.fadeTween) entry.fadeTween.stop();
    if (entry.timeout) entry.timeout.remove(false);
    entry.textObj.destroy();

    deathNotifications.splice(idx, 1);

    for (let i = idx; i < deathNotifications.length; i++) {
        const targetY = NOTIF_Y + i * NOTIF_SPACING;
        scene.tweens.add({
            targets: deathNotifications[i].textObj,
            y: targetY,
            duration: 200,
            ease: 'Cubic.easeOut'
        });
    }
}

function checkItemPickup() {
    if (!items) return;

    const child = items.getChildren().find(
        it => Math.floor((it.x - TILE_SIZE / 2) / TILE_SIZE) === player.gridX &&
              Math.floor((it.y - TILE_SIZE / 2) / TILE_SIZE) === player.gridY
    );
    if (child) {
        socket.emit('pickupItem', { itemId: child.itemId });
        
        items.remove(child, true, true);
    }
}
