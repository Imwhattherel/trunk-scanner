import { Peer } from "../WhackerLinkLibJS/Peer.js";
import P25CallData from "../models/P25CallData.js";

export default class WhackerLinkInterface {
    constructor(io, config) {
        this.io = io;
        this.config = config;

        this.connectSystems();
    }

    connectSystems() {
        this.config.systems.forEach(system => {
           if (system.type === "whackerlink") {
               const peer = new Peer();

               peer.connect(system.address, system.port);
               peer.on('open', () => {console.log("Connected to whackerlink master")});
               peer.on('audioData', (audioPacket) => this.handleAudio(audioPacket, system));
           }
        });
    }

    handleAudio(audioPacket, system) {
        // form a p25 call object from the whackerlink call info
        const call = new P25CallData({
            key: 0,
            system: system.alias,
            dateTime: Date.now(),
            talkgroup: audioPacket.voiceChannel.DstId,
            source: audioPacket.voiceChannel.SrcId,
            frequency: audioPacket.voiceChannel.Frequency,
            talkgroupLabel: 'Unknown',
            talkgroupGroup: 'Unknown',
            systemLabel: 'Unknown',
            patches: [],
            mode: 'P25_WL'
        });

        console.log(call.mode, "Call Received; TG:", call.talkgroup, "Freq:", call.frequency, "Source:", call.source, "System:", call.system, "DateTime:", call.dateTime);


        this.io.emit('new_call', { audio: audioPacket.data, call: call, type: "WAV_STREAM" });
    }
}