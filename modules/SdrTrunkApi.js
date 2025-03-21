import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';

import callData from './callData.js';
import DiscordWebhook from './DiscordWebhook.js';
import LtrCallData from '../models/LtrCallData.js';
import P25CallData from '../models/P25CallData.js';
import DmrCallData from '../models/DmrCallData.js';
import DiscordBot from './DiscordBot.js';
import { transcribeAudio } from './transcribeAudio.js';
import UdpSender from './UdpSender.js';

class SdrTrunkApi {
    constructor(io, config, baseUploadPath) {
        this.port = config.sdrtrunk.port || 3000;
        this.bindAddress = config.sdrtrunk.bindAddress;
        this.discordWebhookEnable = config.discord.webhook.enabled;
        this.config = config;


        this.io = io;
        this.app = express();

        if (this.discordWebhookEnable) {
            this.discordWebhook = new DiscordWebhook(config);
        }

        if (config.discord.bot && config.discord.bot.enabled) {
            this.discordBot = new DiscordBot(config.discord.bot.token, config.discord.bot.channel, config.discord.bot.systemUrl, config.discord.bot.whitelist);
        }

        if (config.udp.send && config.udp.send.enabled) {
            this.sender = new UdpSender(config.udp.send.dstAddress, config.udp.send.port, config.udp.send.debug);
        }

        this.baseUploadPath = baseUploadPath;

        this.upload = multer({ dest: 'uploads/tmp/' });

        this.app.post('/api/call-upload', this.upload.any(), async (req, res) => {
            console.log('Headers:', req.headers);
            console.log('Files:', req.files);
            console.log('Body:', req.body);
            console.log("Received call data");
            const {key, system, test} = req.body;

            const systemConfig = config.systems.find(s => s.id.toString() === system && s.enabled);

            if (!systemConfig) {
                console.error("Unknown system ID: ", system);
                return res.status(401).send("Invalid API key or System ID");
            }

            if (systemConfig.type !== "sdrtrunk") {
                console.error("Unknown system type:", systemConfig.type, "for:", systemConfig.alias);
                return res.status(401).send("Invalid API key or System ID");
            }

            if (systemConfig.apiKey !== key.toString())  {
                console.error("Invalid key for:", systemConfig.alias, "with key:", key);
                return res.status(401).send("Invalid API key or System ID");
            }

            // handle test connection. VERY dumb way to do this. Not sure why sdr trunk expects this body for the test
            if (test && systemConfig.type === "sdrtrunk") {
                console.log("New SDR Trunk connection for system:", systemConfig.alias);
                return res.status(200).send("incomplete call data: no talkgroup");
            }

            if (req.files && req.files.length > 0 && this.io) {
                if (callData.isLtrCall(req.body)){
                    req.body.mode = "LTR_SDRTRUNK";
                    await this.handleCall(new LtrCallData(req.body), req);
                } else if (callData.isP25Call(req.body)) {
                    req.body.mode = "P25_SDRTRUNK";
                    await this.handleCall(new P25CallData(req.body), req);
                } else if (callData.isDmrCall(req.body)){
                    req.body.mode = "DMR_SDRTRUNK";
                    await this.handleCall(new DmrCallData(req.body), req);
                } else {
                    req.body.mode = "UNK_SDRTRUNK";
                    await this.handleCall(req.body, req);
                }
            }

            console.log("Call data received and sent successfully");
            res.send('Call imported successfully.\n');
        });

        this.app.listen(this.port, this.bindAddress, () => {
            console.log(`SDR Trunk server listening at http://${this.bindAddress}:${this.port}`);
        });
    }

    async handleCall(call, req) {
        const originalPath = req.files[0].path;
        const dateObj = new Date(parseInt(call.dateTime) * 1000);
        const datePath = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        const timePath = `${String(dateObj.getHours()).padStart(2, '0')}-${String(dateObj.getMinutes()).padStart(2, '0')}-${String(dateObj.getSeconds()).padStart(2, '0')}`;

        const audioPath = path.join(this.baseUploadPath, call.system, call.talkgroup, datePath, `${timePath}.mp3`);

        if (this.discordWebhookEnable && this.discordWebhook) {
            // TODO: Disable for now, look at again later
            // await this.discordWebhook.sendCallMessage(call);
        }

        console.log(req.body.mode, "Call Received; TG:", call.talkgroup, "Freq:", call.frequency, "Source:", call.source, "System:", call.system, "DateTime:", call.dateTime);
        try {
            await this.storeFile(originalPath, audioPath);
            const relativeAudioPath = `/uploads/${path.relative(this.baseUploadPath, audioPath)}`;

            //TODO: Implement this later
/*            if (this.sender) {
                this.sender.send(msg);
            }*/

            this.io.emit("new_call", { audio: relativeAudioPath, call: call, type: "AUDIO_URL" });

            if (this.discordBot) {
                if (this.discordBot.isTalkgroupWhitelisted(call.talkgroup) || this.config.discord.bot.allowAll) {
                    this.discordBot.enqueue(relativeAudioPath, call.talkgroupLabel, call.source);
                }
            }

            if (this.discordWebhookEnable && this.discordWebhook && this.config.transcribe && this.config.transcribe.assemblyai.enabled) {
                const transcription = await transcribeAudio(audioPath, this.config.transcribe.assemblyai.apiKey);
                if (transcription === null || transcription === undefined || transcription === "") {
                    console.error("Empty transcription received from AssemblyAI; possible bug; skipping");
                    return;
                }

                await this.discordWebhook.sendTranscriptionMessage(call, transcription);
            }

        } catch (err) {
            console.error("Failed to store file:", err);
        }
    }

    async storeFile(originalPath, targetPath) {
        const dir = path.dirname(targetPath);
        try {
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.rename(originalPath, targetPath);
        } catch (err) {
            throw err;
        }
    }
}

export default SdrTrunkApi;