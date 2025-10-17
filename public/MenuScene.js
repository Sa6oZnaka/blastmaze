const http = new XMLHttpRequest();

import socket from './socket.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    preload() {
        
    }

    create() {
        this.graphics = this.add.graphics();
        this.getUser();

        const startText = this.add.text(
            this.cameras.main.centerX,
            this.cameras.main.centerY,
            'Start Game',
            { fontSize: '32px', fill: '#fff' }
        ).setOrigin(0.5);

        startText.setInteractive();
        startText.on('pointerdown', () => {

            // пращаме заявка към сървъра
            socket.emit('findGame', { wantBots: false });

            // слушаме отговора за стаята
            socket.once('roomData', (roomData) => {
                // запазваме данните, за да ги ползваме в GameScene
                this.scene.start('GameScene', { roomData });
            });
        });
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
               
                this.add.text(this.cameras.main.centerX-50, 100, 'Username : ' + this.username, {
                    fontFamily: '"Roboto Condensed"',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 2
                });
            }
        };
    }
}