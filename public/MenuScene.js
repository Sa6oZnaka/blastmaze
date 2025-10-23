import socket from './socket.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    preload() {
        this.load.image('bg', 'assets/block.png');
    }

    create() {
        const { centerX, centerY, width, height } = this.cameras.main;

        this.searching = false;

        // === BACKGROUND ===
        const bg = this.add.tileSprite(centerX, centerY, width, height, 'bg')
            .setTint(0x3b2a20) // кафяво-сив фон
            .setAlpha(0.25);

        this.tweens.add({
            targets: bg,
            tilePositionX: 400,
            duration: 25000,
            repeat: -1,
            ease: 'Linear'
        });

        // === TITLE ===
        const title = this.add.text(centerX, 160, 'BLASTMAZE', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '80px',
            color: '#ffbb55',
            stroke: '#4a2e0f',
            strokeThickness: 8,
            shadow: { offsetY: 5, color: '#000000', blur: 10, fill: true }
        }).setOrigin(0.5);
        this.tweens.add({
            targets: title,
            alpha: { from: 1, to: 0.8 },
            duration: 1600,
            yoyo: true,
            repeat: -1
        });

        // === PROFILE PANEL ===
        this.createProfilePanel(centerX, 70);

        // === BUTTONS ===
        const btnOffset = 170;
        this.casualBtn = this.createModePanel(centerX - btnOffset, centerY + 30, '🪓 CASUAL', 0xc58b4e, true);
        this.competitiveBtn = this.createModePanel(centerX + btnOffset, centerY + 30, '🔥 COMPETITIVE', 0x9c5a33, false);

        this.getUser();
    }

    createModePanel(x, y, label, color, modeFlag) {
        const container = this.add.container(x, y);

        const w = 300, h = 120, r = 20;
        const bg = this.add.graphics();

        const draw = (hover = false) => {
            bg.clear();
            bg.fillStyle(0x1c1a18, 0.85);
            bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
            bg.lineStyle(hover ? 6 : 3, color, hover ? 1 : 0.8);
            bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
            if (hover) {
                bg.fillStyle(0x332b22, 0.25);
                bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
            }
        };
        draw();

        const text = this.add.text(0, 0, label, {
            fontFamily: '"Roboto Condensed"',
            fontSize: '30px',
            color: '#fff7e6',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        container.add([bg, text]);
        container.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);

        container.on('pointerover', () => {
            if (this.searching) return;
            draw(true);
            this.tweens.add({ targets: container, scale: 1.06, duration: 180, ease: 'Back.Out' });
        });

        container.on('pointerout', () => {
            draw(false);
            this.tweens.add({ targets: container, scale: 1, duration: 150, ease: 'Sine.Out' });
        });

        container.on('pointerdown', () => {
            if (this.searching) return;
            this.startSearch(modeFlag);
        });

        return { container, bg, text };
    }

    createProfilePanel(x, y) {
        const panel = this.add.container(x, y);
        const width = 640, height = 70, radius = 18;

        const bg = this.add.graphics();
        bg.fillStyle(0x1b1b1b, 0.8);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
        bg.lineStyle(2, 0x7a5533, 0.7);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

        this.usernameText = this.add.text(-260, 0, '👤 Loading...', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '24px',
            color: '#ffeebb'
        }).setOrigin(0, 0.5);

        const barW = 160, barH = 10;
        this.xpBG = this.add.rectangle(180, 0, barW, barH, 0x2e2a25);
        this.xpBar = this.add.rectangle(180 - barW / 2, 0, 0, barH, 0xc58b4e).setOrigin(0, 0.5);
        this.levelText = this.add.text(180, -22, 'Lvl 1', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '16px',
            color: '#ffcc77'
        }).setOrigin(0.5);

        panel.add([bg, this.usernameText, this.xpBG, this.xpBar, this.levelText]);
        this.profilePanel = panel;
    }

    startSearch(mode) {
        this.searching = true;
        this.casualBtn.container.disableInteractive();
        this.competitiveBtn.container.disableInteractive();

        const { centerX, centerY } = this.cameras.main;

        this.searchText = this.add.text(centerX, centerY + 200, 'Searching for game...', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '28px',
            color: '#ffbb55',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({
            targets: this.searchText,
            alpha: { from: 1, to: 0.4 },
            duration: 600,
            yoyo: true,
            repeat: -1
        });

        this.cancelBtn = this.createModePanel(centerX, centerY + 300, '❌ CANCEL SEARCH', 0x6b4a2d, null);
        this.cancelBtn.container.on('pointerdown', () => this.cancelSearch());

        socket.emit('findGame', { mode });
        socket.once('roomData', (roomData) => {
            if (!this.searching) return;
            this.scene.start('GameScene', { roomData });
        });
    }

    cancelSearch() {
        this.searching = false;
        socket.emit('cancelSearch');
        this.searchText?.destroy();
        this.cancelBtn?.container.destroy();
        this.casualBtn.container.setInteractive();
        this.competitiveBtn.container.setInteractive();
    }

    getUser() {
        const http = new XMLHttpRequest();
        http.open('GET', '/getUser', true);
        http.send();
        http.onreadystatechange = () => {
            if (http.readyState === 4 && http.status === 200) {
                const data = JSON.parse(http.responseText);
                const username = data.user || 'Player';
                const level = data.level || 1;
                const xp = data.xp || 50;
                const maxXp = data.maxXp || 100;

                this.usernameText.setText(`👤 ${username}`);
                this.levelText.setText(`Lvl ${level}`);
                this.tweens.add({
                    targets: this.xpBar,
                    width: (xp / maxXp) * 160,
                    duration: 1300,
                    ease: 'Power2'
                });
            }
        };
    }
}
