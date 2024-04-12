const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

class WebServer {
    constructor(config) {
        this.port = config.web.port || 4000;
        this.bindAddress = config.web.bindAddress || "0.0.0.0";
        this.debug = config.web.debug || false;

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);

        this.connectedUsers = 0;

        this.app.set('views', path.join(__dirname, '../views'));
        this.app.set('view engine', 'ejs');

        this.app.use('/uploads', express.static('uploads'));
        this.app.use('/public', express.static('public'));

        this.app.get('/', (req, res) => {
            const groups = config.groups;

            res.render("index", { groups, connectedUsers: this.connectedUsers });
        });

        this.app.get('/apxRadio', (req, res) => {
            const groups = config.groups;

            res.render("apxRadio", {groups});
        });

        this.app.get('/api/recordings', (req, res) => {
            const { system, talkgroup, date } = req.query; // Filters from query params
            const baseDir = path.join(__dirname, '../uploads');

            try {
                let directories = [baseDir, system, talkgroup, date].filter(Boolean); // Remove falsy values
                let searchPath = path.join(...directories);

                fs.readdir(searchPath, (err, files) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Error reading directory');
                    }

                    let recordings = files.map(file => ({
                        filename: file,
                        path: `/uploads/${system}/${talkgroup}/${date}/${file}`,
                        talkgroup: talkgroup,
                        date: date,
                        system: system
                    }));

                    res.json(recordings);
                });
            } catch (error) {
                console.error(error);
                res.status(500).send('Server error');
            }
        });

        this.io.on('connection', (socket) => {
            this.connectedUsers++;
            this.emitUserCount();

            if (this.debug) {
                console.log(`A user connected. Total connected users: ${this.connectedUsers}`);
            }

            socket.on('disconnect', () => {
                this.connectedUsers--;
                this.emitUserCount();

                if (this.debug) {
                    console.log(`A user disconnected. Total connected users: ${this.connectedUsers}`);
                }
            });
        });

        this.server.listen(this.port, () => {
            console.log(`Web server listening at http://localhost:${this.port}`);
        });
    }

    emitUserCount() {
        this.io.emit('userCount', this.connectedUsers);
    }
}

module.exports = WebServer;