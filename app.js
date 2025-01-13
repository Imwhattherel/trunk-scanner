import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import SdrTrunkApi from './modules/SdrTrunkApi.js';
import WebServer from './modules/WebServer.js';
import {loadConfig} from './modules/configLoader.js';
import UdpReceiver from './modules/UdpReceiver.js';
import path from 'path';
import { fileURLToPath } from 'url';
import WhackerLinkInterface from "./modules/WhackerLinkInterface.js";

const argv = yargs(hideBin(process.argv))
    .option('c', {
        alias: 'config',
        describe: 'Path to config file',
        type: 'string',
    })
    .help()
    .alias('help', 'h')
    .argv;

// Template for config object
let config = {
    web: {},
    sdrtrunk: {},
    whackerlink: {},
    discord: null,
    systems: []
};

if (argv.config) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const config = loadConfig(argv.config);
    const baseUploadPath = path.join(__dirname, 'uploads');

    const webServer = new WebServer(config);

    // if ((!config.sdrtrunk || !config.sdrtrunk.enabled) && (!config.udp || !config.udp.receive.enabled)) {
    //     console.log('SDRTrunk or UDP not enabled or no config found for them; Must have at least one API for this to be useful');
    //     process.exit(1);
    // }

    if (config.sdrtrunk.enabled) {
        new SdrTrunkApi(webServer.io, config, baseUploadPath);
    }

    if (config.udp.receive.enabled) {
        new UdpReceiver(webServer.io, config, baseUploadPath);
    }

    if (config.whackerlink && config.whackerlink.enabled) {
        new WhackerLinkInterface(webServer.io, config);
    }

} else {
    console.error('No config file specified');
    process.exit(1);
}