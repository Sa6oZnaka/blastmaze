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
let walls;
let bombs;
let items;

let gameSceneRef = null;
let bombPrevew = false;

let respawnButton;
let mainMenuButton;
let deadText;
let resultText;
let wins = 0;

let showRounds = false;
let showRespawnMenu = false;

let playerXP = 0;
let playerLevel = 1;
let xpToNextLevel = 100;

import socket from './socket.js';

socket.on('playerJoined', (data) => {
    safeEvent(() => {
        addPlayer(data);
    });
});

socket.on('playerLeft', ({ id }) => {
    safeEvent(() => {

        var username = id;
        if (players[id]) {
            if(players[id].username){
                username = players[id].username;
            }

            players[id].destroy();
            delete players[id];
        }

        let text = "Player " + username + " left";
            showDeathNotification(text);
    });
});

socket.on('playerDied', ({ id }) => {
    safeEvent(() => {
        if(!players[id])
            return;

        showDeathNotification( "Player " + players[id].username + " died");

        if(players[id].bot)
            return;

        players[id].visible = false;

        if(id == socket.id && showRespawnMenu){
            deadText.setVisible(true);
            respawnButton.setVisible(true);
            mainMenuButton.setVisible(true);

            bombPrevew = false;
            canMove = false;
        }
    });
});

socket.on('playerRespawned', (data) => {
    safeEvent(() => {
        players[data.id].x = data.x * TILE_SIZE + TILE_SIZE / 2;
        players[data.id].y = data.y * TILE_SIZE + TILE_SIZE / 2;
        players[data.id].visible = true;

        if(socket.id === data.id){
            // blocks
            for (const key in blocksMap) {
                gameSceneRef.raycaster.removeMappedObjects(blocksMap[key]);
                blocksMap[key].destroy();
                delete blocksMap[key];
            }

            player = players[socket.id];

            player.gridX = data.x;
            player.gridY = data.y;
            canMove = true;

            gameSceneRef.cameras.main.startFollow(player);
            gameSceneRef.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

            deadText.setVisible(false);
            respawnButton.setVisible(false);
            mainMenuButton.setVisible(false);

            updateVisibleBlocks.call();
        }
    });
});


socket.on('itemSpawned', (item) => {
    safeEvent(() => {
        const sprite = gameSceneRef.add.rectangle(
            item.x * TILE_SIZE + TILE_SIZE / 2,
            item.y * TILE_SIZE + TILE_SIZE / 2,
            TILE_SIZE * 0.6,
            TILE_SIZE * 0.6,
            item.type === "bomb" ? 0x00aaff : 0xffaa00
        );

        sprite.setDepth(5);
        sprite.itemId = item.id;
        sprite.itemType = item.type;

        items.add(sprite);
    });
});

socket.on('itemPicked', ({ playerId, itemId, type }) => {
    safeEvent(() => {
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

            showDeathNotification(msg);
        }

    });
});

socket.on('playerLeft', ({ id }) => {
    safeEvent(() => {

        if (players[id]) {
            players[id].destroy();
            delete players[id];
        }

    });
});

socket.on('gameEnded', (data) => {
    safeEvent(() => {
        console.log("GAME ENDED");
        canMove = false;

        showMatchResults(data);
    });
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

export default class GameScene extends Phaser.Scene {

    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        safeEvent(() => {
            resetGameScene(data.roomData); 
        });
    }

    preload() {
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


    create() {
        // animations
        gameSceneRef = this;
        const framerate = 20;
        this.anims.create({
            key: 'walk-right',
            frames: this.anims.generateFrameNumbers('player', { frames: [0, 4, 8] }),
            frameRate: framerate,
            repeat: -1
        });

        this.anims.create({
            key: 'walk-left',
            frames: this.anims.generateFrameNumbers('player', { frames: [1, 5, 9] }),
            frameRate: framerate,
            repeat: -1
        });

        this.anims.create({
            key: 'walk-up',
            frames: this.anims.generateFrameNumbers('player', { frames: [2, 6, 10] }),
            frameRate: framerate,
            repeat: -1
        });

        this.anims.create({
            key: 'walk-down',
            frames: this.anims.generateFrameNumbers('player', { frames: [3, 7, 11] }),
            frameRate: framerate,
            repeat: -1
        });

        walls = this.physics.add.staticGroup();
        mapGraphics = this.add.graphics();
        mapGraphics.setDepth(-1); // да е зад всички обекти
        mapGraphics.setScrollFactor(1);

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
        items = this.add.group();

        this.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
        this.physics.world.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

        // Light
        createLightSystem(this);
        this.darkness = this.make.renderTexture({
            width: this.cameras.main.width * 2,
            height: this.cameras.main.height * 2,
            add: true
        });
        this.darkness.setDepth(10);
        this.darkness.setScrollFactor(0);


        this.darkness2 = this.make.renderTexture({
            width: this.cameras.main.width * 2,
            height: this.cameras.main.height * 2,
            add: true
        });
        this.darkness2.setDepth(10);
        this.darkness2.setScrollFactor(0);


        // Gradient (мек светлинен кръг)
        this.gradientTexture = this.make.renderTexture({
            width: this.cameras.main.width * 2,
            height: this.cameras.main.height * 2,
            add: false
        });

        // Raycaster светлина
        this.rayTexture = this.make.renderTexture({
            width: this.cameras.main.width * 2,
            height: this.cameras.main.height * 2,
            add: false
        });

        this.tweens.add({
            targets: this.lightImage,
            scale: { from: 1.9, to: 2.1 },
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.fpsText = this.add.text(10, 10, '', {
            font: '16px Arial',
            fill: '#ffffff'
        })
        .setScrollFactor(0)
        .setDepth(100);

        // Visible blocks from raycaster
        visibleBlocks = this.physics.add.staticGroup();
        this.renderedCells = new Set();

        this.cursors = this.input.keyboard.createCursorKeys();

        // Raycaster
        this.raycaster = this.raycasterPlugin.createRaycaster();
        this.ray = this.raycaster.createRay({ origin: this.player, autoSlice: true });

        this.lightGraphics = this.add.graphics({ fillStyle: { color: 0xffffaa, alpha: 0.3 } });
        createLightGradientTexture(this);

        const lightMask = this.lightGraphics.createGeometryMask();
        lightMask.invertAlpha = true;
        this.darkness.setMask(lightMask);


        updateVisibleBlocks();

        /// UI
        const hudY = 8;
        const hudFont = { font: '20px Arial', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 };

        this.roundCenterText = this.add.text(
            this.cameras.main.centerX,
            hudY,
            "Round ?",
            hudFont
        ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201).setVisible(false);

        respawnButton = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY + 100, 'Respawn', {
            fontFamily: 'Arial',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: '#1e1e1e',
            padding: { x: 20, y: 10 },
            align: 'center'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(300)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            if(!canMove) { // only if is dead
                socket.emit('respawn');
            }
        });
        respawnButton.setVisible(false);

        // --- Main Menu Button ---
        mainMenuButton = this.add.text(
            this.cameras.main.centerX,
            this.cameras.main.centerY + 160,
            'Main Menu', {
                fontFamily: 'Arial',
                fontSize: '28px',
                fontStyle: 'bold',
                color: '#ffffff',
                backgroundColor: '#1e1e1e',
                padding: { x: 20, y: 10 },
                align: 'center'
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(300)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                gameSceneRef.scene.stop('GameScene');
                gameSceneRef.scene.start('MenuScene');
                window.location.reload();
            });
        mainMenuButton.setVisible(false);

        deadText = this.add.text(
            this.cameras.main.centerX, 
            this.cameras.main.centerY,
            'DEAD',
            {
                font: '64px Arial',
                fill: '#ff0000',
                stroke: '#000',
                strokeThickness: 6
            }
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(200)
        .setVisible(false);

        // Socket events after scene is created
        sceneCreated = true;
        for (const evt of eventQueue) {
            evt();
        }
        eventQueue = [];
    }

    update() {
        // FPS
        const fps = Math.floor(this.game.loop.actualFps);
        this.fpsText.setText(`${fps}`);

        updateLightGradient.call(this);

        updateLighting.call(this);

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
}

function updateLighting() {
    if (!player || !this.darkness || !this.lightGraphics || !this.raycaster || !this.ray) return;

    this.darkness.clear();
    this.darkness.fill(0x000000, 0.45);
    this.lightGraphics.clear();

    this.raycaster.mapGameObjects(visibleBlocks.getChildren(), true);
    this.ray.setOrigin(player.x, player.y);
    const intersections = this.ray.castCircle();

    if (intersections.length > 0) {
        this.lightGraphics.fillPoints(intersections, true);
    }

    const cam = this.cameras.main;
    const buffer = 50;
    this.raycaster.setBoundingBox(
        cam.scrollX - buffer,
        cam.scrollY - buffer,
        cam.width + buffer * 2,
        cam.height + buffer * 2
    );

    const lightMask = this.lightGraphics.createGeometryMask();
    lightMask.invertAlpha = true;

    this.darkness.setMask(lightMask);
}

function createLightSystem(scene) {
    // Създай darkness слой
    scene.darkness = scene.make.renderTexture({
        width: scene.cameras.main.width * 2,
        height: scene.cameras.main.height * 2,
        add: true
    });
    scene.darkness.setDepth(10);
    scene.darkness.setScrollFactor(0);

    // Създай светлинното изображение само веднъж
    scene.lightImage = scene.add.image(0, 0, 'lightGradient')
        .setScale(2)
        .setAlpha(1)
        .setVisible(false); // няма нужда да е визуално в сцената
}

function updateLightGradient() {
    if (!player || !this.lightImage || !this.darkness) return;

    this.darkness2.clear();
    this.darkness2.fill(0x000000, 1);

    const camView = this.cameras.main.worldView;
    const playerCamX = player.x - camView.x + this.cameras.main.width;
    const playerCamY = player.y - camView.y + this.cameras.main.height;

    this.lightImage.setPosition(playerCamX, playerCamY);
    this.darkness2.erase(this.lightImage);
}

function updateVisibleBlocks() {
    const radius = 10;

    // if its called before initiated
    if(!visibleBlocks)
        return;

    if(!player) return;

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

    //if(!this || !this.raycaster) return;

    for (const key in blocksMap) {
        const [bx, by] = key.split('_').map(Number);
        if (bx < startX || bx >= endX || by < startY || by >= endY) {
            gameSceneRef.raycaster.removeMappedObjects(blocksMap[key]);
            blocksMap[key].destroy();
            delete blocksMap[key];
        }
    }
}

function tryMove(dx, dy) {
    const newX = player.gridX + dx;
    const newY = player.gridY + dy;

    if (isInsideGrid(newX, newY) && grid[newY][newX] === 0) {
    
        let nextPlayerX = newX * TILE_SIZE + TILE_SIZE / 2;
        let nextPlayerY = newY * TILE_SIZE + TILE_SIZE / 2;
        
        
        moving = true;

        socket.emit('move', { dx, dy });

        let moveUp = nextPlayerY < player.y;
        let moveDown = nextPlayerY > player.y;
        let moveRight = nextPlayerX > player.x;

        if(!player || !player.anims) return;

        if (nextPlayerY < player.y)
            player.anims.play('walk-up', true);
        else if (nextPlayerY > player.y)
            player.anims.play('walk-down', true);
        else if (nextPlayerX > player.x)
            player.anims.play('walk-right', true);
        else
            player.anims.play('walk-left', true);

        moveTween = gameSceneRef.tweens.add({
            targets: player,
            x: nextPlayerX,
            y: nextPlayerY,
            duration: MOVE_DURATION,
            ease: 'Linear',
            onComplete: () => {
                player.gridX = newX;
                player.gridY = newY;
                moving = false;

                // player died
                if(!player.anims)
                    return;

                player.anims.stop();

                if (moveUp)
                    player.setFrame(2);
                else if (moveDown)
                    player.setFrame(3);
                else if (moveRight)
                    player.setFrame(0);
                else
                    player.setFrame(1);
                
                checkItemPickup();
                updateVisibleBlocks.call();
            }
        });

        return true;
    }
    return false;
}

socket.on('revertMove', ({ x, y }) => {
    console.warn("Reverting move due to server correction");

    if (moveTween) {
        moveTween.stop();
        moveTween = null;
    }

    moving = false;

    player.gridX = x;
    player.gridY = y;
    player.x = x * TILE_SIZE + TILE_SIZE / 2;
    player.y = y * TILE_SIZE + TILE_SIZE / 2;

    player.anims.stop();
});

socket.on('roundEnded', ({ round, winner, draw, scores, totalRounds }) => {
    safeEvent(() => {
        canMove = false;

        let msg = "";
        let iWon = false;

        if (draw) {
            msg = "🤝 Draw!";
        } else if (winner) {

            if(winner.id == socket.id){
                msg = `Winner!`;
                wins ++;
                iWon = true;
            }else{
                msg = `Loser!`;
            }
        }

        resultText = gameSceneRef.add.text(
            gameSceneRef.cameras.main.centerX,
            gameSceneRef.cameras.main.centerY - 100,
            msg,
            {
                font: '48px Arial',
                fill: draw 
                    ? '#e2c431ff' 
                    : iWon 
                        ? '#149a14ff' 
                        : '#c90f0fff',
                stroke: '#000',
                strokeThickness: 6
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(400);
    });
});

function updateRound(round){
    gameSceneRef.roundCenterText.setText(`Round ${round} (${wins})`);
}

socket.on('roomData', (data) => {
    safeEvent(() => {
        if (!data) return;

        resetGameScene(data);;
    });
});

function resetGameScene(roomData) {
    if (!gameSceneRef) return;

    if (gameSceneRef.tweens) gameSceneRef.tweens.killAll();
    if (gameSceneRef.time) gameSceneRef.time.removeAllEvents();

    if(roomData.showRounds){
        updateRound(roomData.round);
        gameSceneRef.roundCenterText.setVisible(true);
    }

    showRespawnMenu = roomData.respawn;

    if(resultText)
        resultText.destroy();

    // bomb
    if (bombs) {
        const bombChildren = bombs.getChildren ? [...bombs.getChildren()] : [];
        for (const bomb of bombChildren) {
            if (bomb.previewTiles) {
                bomb.previewTiles.forEach(tile => tile.destroy());
                bomb.previewTiles = [];
            }

            if (bomb.delayedCalls) {
                bomb.delayedCalls.forEach(dc => dc.remove(false));
                bomb.delayedCalls = [];
            }

            if (bomb.anims) bomb.anims.stop();
            gameSceneRef.tweens.killTweensOf(bomb);
            bomb.destroy(true); 
        }
        bombs.clear(true);
    }

    



    // blocks
    for (const key in blocksMap) {
        const block = blocksMap[key];
        if (block) {
            if (gameSceneRef.raycaster)
                gameSceneRef.raycaster.removeMappedObjects(block);
            block.destroy();
            delete blocksMap[key];
        }
    }


    // Destroy players visuals then reset players object
    for (const id in players) {
        const p = players[id];
        if (p) p.destroy();
        delete players[id];
    }
    players = {};
    player = null;


    //Clear notifications
    if (deathNotifications.length) {
        deathNotifications.forEach(entry => {
            entry.fadeTween?.stop();
            entry.timeout?.remove(false);
            entry.textObj.destroy();
        });
        deathNotifications = [];
    }

    // items
    if (items && items.getChildren) {
        const children = [...items.getChildren()];
        for (const item of children) {
            items.remove(item, true, true);
        }
    }

    grid = roomData.grid;
    GRID_WIDTH = grid[0].length;
    GRID_HEIGHT = grid.length;

    player = null;
    canMove = false;
    moving = false;

    deadText.setVisible(false);
    respawnButton.setVisible(false);
    mainMenuButton.setVisible(false);

    if (roomData.players) {
        for (const id in roomData.players) {
            addPlayer(roomData.players[id]); // използва gameSceneRef
            
            if (roomData.players[id].id == socket.id) {

                player = players[socket.id];
                if (player) {
                    player.gridX = roomData.players[id].x;
                    player.gridY = roomData.players[id].y;
                    player.x = player.gridX * TILE_SIZE + TILE_SIZE/2;
                    player.y = player.gridY * TILE_SIZE + TILE_SIZE/2;
                    player.visible = roomData.players[id].alive !== false;
                    canMove = true;
                    gameSceneRef.cameras.main.startFollow(player);
                    gameSceneRef.cameras.main.setBounds(0, 0, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
                }
            }
        }
    }

    updateVisibleBlocks.call();
}


socket.on('playerMoved', ({ id, x, y }) => {
    safeEvent(() => {
        if (id === socket.id) return;

        const other = players[id];
        if (!other) return;

        const worldX = x * TILE_SIZE + TILE_SIZE / 2;
        const worldY = y * TILE_SIZE + TILE_SIZE / 2;

        let moveUp = worldY < other.y;
        let moveDown = worldY > other.y;
        let moveRight = worldX > other.x;

        if (worldY < other.y)
        other.anims.play('walk-up', true);
        else if (worldY > other.y)
            other.anims.play('walk-down', true);
        else if (worldX > other.x)
            other.anims.play('walk-right', true);
        else
            other.anims.play('walk-left', true);

        other.scene.tweens.add({
            targets: other,
            x: worldX,
            y: worldY,
            duration: MOVE_DURATION,
            ease: 'Linear',
            onComplete: () => {
                if(!other.anims)
                    return;

                other.anims.stop();

                if (moveUp)
                    other.setFrame(2);
                else if (moveDown)
                    other.setFrame(3);
                else if (moveRight)
                    other.setFrame(0);
                else
                    other.setFrame(1);
            }
        });
    });
});

function isInsideGrid(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function placeBomb() {
    socket.emit('placeBomb');
}

function safeEvent(callback) {
    if (sceneCreated && gameSceneRef) {
        callback();
    } else {
        eventQueue.push(callback);
    }
}

function showMatchResults(data) {
    const { winner, players, draw } = data;

    const myPlayer = players.find(p => p.id === socket.id);
    if (!myPlayer) return;

    const oldXP = Number(myPlayer.oldXP || 0);
    const newXP = Number(myPlayer.newXP || oldXP);
    const oldLevel = Number(myPlayer.oldLevel || Math.floor(oldXP / 100) + 1);
    const newLevel = Number(myPlayer.newLevel || Math.floor(newXP / 100) + 1);
    const xpToNextLevel = Number(myPlayer.xpToNextLevel || 100);

    if (typeof window.playerXP === 'undefined') window.playerXP = oldXP;
    if (typeof window.playerLevel === 'undefined') window.playerLevel = oldLevel;
    if (typeof window.xpToNextLevel === 'undefined') window.xpToNextLevel = xpToNextLevel;

    const bg = gameSceneRef.add.rectangle(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY,
        gameSceneRef.cameras.main.width,
        gameSceneRef.cameras.main.height,
        0x000000,
        0.6
    ).setScrollFactor(0).setDepth(999);

    const title = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY - 180,
        'RESULTS 🏁',
        { font: '48px Arial', fill: '#ffffff', stroke: '#000000', strokeThickness: 6 }
    ).setOrigin(0.5).setDepth(1000);

    const winnerText = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY - 100,
        draw ? 'Draw!' : (winner ? `Winner: ${winner.username}` : 'Draw!'),
        { font: '36px Arial', fill: '#00ff00', stroke: '#000', strokeThickness: 4 }
    ).setOrigin(0.5).setDepth(1000);

    // --- XP bar layout ---
    const barWidth = 400;
    const barHeight = 30;
    const barX = gameSceneRef.cameras.main.centerX - barWidth / 2;
    const barY = gameSceneRef.cameras.main.centerY + 20;

    const barBg = gameSceneRef.add.rectangle(barX + barWidth / 2, barY, barWidth, barHeight, 0x333333)
        .setScrollFactor(0).setDepth(1000);

    const oldXPInLevel = oldXP % xpToNextLevel;
    const newXPInLevel = newXP % xpToNextLevel;

    const barFill = gameSceneRef.add.rectangle(barX, barY, (oldXPInLevel / xpToNextLevel) * barWidth, barHeight, 0x00ff88)
        .setOrigin(0, 0.5).setDepth(1001).setScrollFactor(0);

    const levelText = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX, barY - 40,
        `Level ${oldLevel}`,
        { font: '28px Arial', fill: '#ffffff' }
    ).setOrigin(0.5).setDepth(1001).setScrollFactor(0);

    const xpText = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX, barY + 40,
        `XP: ${oldXPInLevel} / ${xpToNextLevel} (+${newXP - oldXP})`,
        { font: '22px Arial', fill: '#ffffff' }
    ).setOrigin(0.5).setDepth(1001).setScrollFactor(0);

    const gainedText = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY + 90,
        `+${newXP - oldXP} XP`,
        { font: '26px Arial', fill: '#ffff00', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5).setDepth(1001).setScrollFactor(0);

    function animateXP(currentTotalXP, targetTotalXP, currentLevel, targetLevel) {
        const curInLevel = currentTotalXP % xpToNextLevel;
        const targInLevel = (currentLevel === targetLevel)
            ? (targetTotalXP % xpToNextLevel)
            : xpToNextLevel;

        const delta = Math.max(1, Math.abs(targInLevel - curInLevel));
        const duration = Math.min(1800, 300 + delta * 6);

        gameSceneRef.tweens.addCounter({
            from: curInLevel,
            to: targInLevel,
            duration,
            ease: 'Cubic.easeOut',
            onUpdate: (tween) => {
                const v = tween.getValue();
                barFill.width = (v / xpToNextLevel) * barWidth;
                xpText.setText(`XP: ${Math.floor(v)} / ${xpToNextLevel} (+${targetTotalXP - oldXP})`);
            },
            onComplete: () => {
                if (targInLevel === xpToNextLevel && targetLevel > currentLevel) {
                    if (typeof showLevelUpEffect === 'function') showLevelUpEffect();

                    levelText.setText(`Level ${currentLevel + 1}`);

                    barFill.width = 0;

                    gameSceneRef.time.delayedCall(350, () => {
                        const nextCurrentTotal = (currentLevel + 1) * xpToNextLevel;
                        const nextCurrentLevel = currentLevel + 1;
                        if (targetLevel > nextCurrentLevel) {
                            animateXP(nextCurrentTotal, targetTotalXP, nextCurrentLevel, targetLevel);
                        } else {
                            animateXP(nextCurrentTotal, targetTotalXP, nextCurrentLevel, targetLevel);
                        }
                    });
                } else {
                    window.playerXP = targetTotalXP;
                    window.playerLevel = targetLevel;

                    const finalInLevel = targetTotalXP % xpToNextLevel;
                    barFill.width = (finalInLevel / xpToNextLevel) * barWidth;
                    xpText.setText(`XP: ${finalInLevel} / ${xpToNextLevel} (+${targetTotalXP - oldXP})`);
                }
            }
        });
    }

    animateXP(oldXP, newXP, oldLevel, newLevel);

    const contBtn = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY + 150,
        'Continue',
        {
            font: '28px Arial',
            fill: '#ffffff',
            backgroundColor: '#1e1e1e',
            padding: { x: 20, y: 10 }
        }
    )
        .setOrigin(0.5)
        .setDepth(1001)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            [bg, title, winnerText, barBg, barFill, levelText, xpText, gainedText, contBtn].forEach(e => {
                if (e && e.destroy) e.destroy();
            });
            window.playerXP = newXP;
            window.playerLevel = newLevel;

            gameSceneRef.scene.stop('GameScene');
            gameSceneRef.scene.start('MenuScene');
            window.location.reload();
        });
}

function showLevelUpEffect() {
    const text = gameSceneRef.add.text(
        gameSceneRef.cameras.main.centerX,
        gameSceneRef.cameras.main.centerY - 20,
        'LEVEL UP! 🎉',
        {
            font: '56px Arial',
            fill: '#ffdd00',
            stroke: '#000',
            strokeThickness: 6
        }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1500);

    gameSceneRef.tweens.add({
        targets: text,
        scale: { from: 1, to: 1.4 },
        alpha: { from: 1, to: 0 },
        duration: 1500,
        ease: 'Cubic.easeOut',
        onComplete: () => text.destroy()
    });
}

socket.on('bombPlaced', ({ id, x, y }) => {
    safeEvent(() => {
        const bomb = gameSceneRef.add.sprite(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            'bomb',
            0
        );

        bomb.displayWidth = TILE_SIZE;
        bomb.displayHeight = TILE_SIZE;

        bombs.add(bomb);
        bomb.setDepth(1);

        bomb.delayedCalls = [];
        bomb.delayedCalls.push(gameSceneRef.time.delayedCall(600, () => { bomb.setFrame(1); }));
        bomb.delayedCalls.push(gameSceneRef.time.delayedCall(1200, () => { bomb.setFrame(2); }));
        bomb.delayedCalls.push(gameSceneRef.time.delayedCall(1800, () => { bomb.setFrame(3); }));


        if(bombPrevew){
            const affected = previewExplosion(x, y);
            affected.forEach(({ x: ax, y: ay }) => {
                const cx = ax * TILE_SIZE;
                const cy = ay * TILE_SIZE;
                const previewTile = gameSceneRef.add.rectangle(
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
});

socket.on('bombExploded', ({ x, y, affected }) => {
    safeEvent(() => {

        if(! bombs) return;

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

            const explosion = gameSceneRef.add.image(cx, cy, 'explosionGradient');
            explosion.setDepth(110);
            explosion.setScale(0.5);
            explosion.setAlpha(1);

            gameSceneRef.tweens.add({
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
                    gameSceneRef.tweens.add({
                        targets: block,
                        tint: 0xff5555,
                        scaleX: 0.8,
                        scaleY: 0.8,
                        alpha: 0,
                        duration: 200,
                        ease: 'Cubic.easeIn',
                        onComplete: () => {
                            gameSceneRef.raycaster.removeMappedObjects(block);
                            block.destroy();
                            delete blocksMap[key];
                        }
                    });
                }
            }
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
    });
});

function createLightGradientTexture() {
    const size = 100;
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

    gameSceneRef.textures.addBase64('explosionGradient', canvas.toDataURL());
}

function addPlayer(data) {
    const p = gameSceneRef.add.sprite(
        data.x * TILE_SIZE + TILE_SIZE / 2,
        data.y * TILE_SIZE + TILE_SIZE / 2,
        'player',
        0
    );
    p.displayWidth = TILE_SIZE;
    p.displayHeight = TILE_SIZE;
    p.username = data.username;
    p.bot = data.bot;

    if(!data.alive)
        p.visible = false;

    players[data.id] = p;
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

function showDeathNotification(text) {
    const txt = gameSceneRef.add.text(NOTIF_X, NOTIF_Y + deathNotifications.length * NOTIF_SPACING, text, {
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

    entry.timeout = gameSceneRef.time.delayedCall(NOTIF_DURATION, () => {
        entry.fadeTween = gameSceneRef.tweens.add({
            targets: entry.textObj,
            alpha: 0,
            duration: NOTIF_FADE_DURATION,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                removeDeathNotification(entry);
            }
        });
    });
}

function removeDeathNotification(entry) {
    const idx = deathNotifications.indexOf(entry);
    if (idx === -1) return;

    if (entry.fadeTween) entry.fadeTween.stop();
    if (entry.timeout) entry.timeout.remove(false);
    entry.textObj.destroy();

    deathNotifications.splice(idx, 1);

    for (let i = idx; i < deathNotifications.length; i++) {
        const targetY = NOTIF_Y + i * NOTIF_SPACING;
        gameSceneRef.tweens.add({
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
