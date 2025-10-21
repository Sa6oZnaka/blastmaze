const http = new XMLHttpRequest();

import socket from './socket.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    preload() {}

    create() {
        this.graphics = this.add.graphics();
        this.getUser();

        const centerX = this.cameras.main.centerX;
        const centerY = this.cameras.main.centerY;

        this.add.text(centerX, 150, '⚔️ Select Game Mode', {
            fontFamily: '"Roboto Condensed"',
            fontSize: '42px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Casual
        this.createFancyButton(centerX, centerY - 40, 'Casual Game', 0x00aaff, () => {
            socket.emit('findGame', { mode: true });
            socket.once('roomData', (roomData) => {
                this.scene.start('GameScene', { roomData });
            });
        });

        // Competitive
        this.createFancyButton(centerX, centerY + 60, 'Competitive Game', 0xff5555, () => {
            socket.emit('findGame', { mode: false });
            socket.once('roomData', (roomData) => {
                this.scene.start('GameScene', { roomData });
            });
        });
    }

    createFancyButton(x, y, text, color, callback) {
        const width = 320;
        const height = 70;
        const radius = 18;

        const container = this.add.container(x, y);

        const bg = this.add.graphics();
        const drawNormal = () => {
            bg.clear();
            bg.fillStyle(color, 1);
            bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
            bg.lineStyle(4, 0xffffff, 0.35);
            bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
        };
        const drawHover = () => {
            bg.clear();
            bg.fillStyle(color, 1);
            bg.fillRoundedRect(-width/2, -height/2, width, height, radius);
            bg.lineStyle(6, 0xffffff, 0.95);
            bg.strokeRoundedRect(-width/2, -height/2, width, height, radius);
        };
        drawNormal();

        const label = this.add.text(0, 0, text, {
            fontSize: '28px',
            fontFamily: '"Roboto Condensed"',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        container.add([bg, label]);

        const zone = this.add.zone(x, y, width, height).setOrigin(0.5);
        zone.setInteractive();

        zone.on('pointerover', () => {
            drawHover();
            this.tweens.killTweensOf(container);
            this.tweens.add({ targets: container, scale: 1.06, duration: 130, ease: 'Power1' });
            this.input.manager.canvas.style.cursor = 'pointer';
        });

        zone.on('pointerout', () => {
            drawNormal();
            this.tweens.killTweensOf(container);
            this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Power1' });
            this.input.manager.canvas.style.cursor = 'default';
        });

        zone.on('pointerdown', () => {
            this.tweens.killTweensOf(container);
            this.tweens.add({
                targets: container,
                scale: 0.94,
                duration: 90,
                yoyo: true,
                ease: 'Power1',
                onComplete: () => {
                    try {
                        callback();
                    } catch (err) {
                        console.error('button callback error:', err);
                    }
                }
            });
        });

        return { container, zone, bg, label };
    }

    update() {
        
    }

    getUser() {
        http.open('GET', '/getUser', true);
        http.send();
        http.onreadystatechange = () => {
            if (http.readyState === 4 && http.status === 200) {
                let data = JSON.parse(http.responseText);
                this.username = data.user;

                this.add.text(
                    this.cameras.main.centerX,
                    80,
                    `👤 Username: ${this.username}`,
                    {
                        fontFamily: '"Roboto Condensed"',
                        fontSize: '26px',
                        fontStyle: 'bold',
                        color: '#ffff88',
                        stroke: '#000000',
                        strokeThickness: 3
                    }
                ).setOrigin(0.5);
            }
        };
    }
}
