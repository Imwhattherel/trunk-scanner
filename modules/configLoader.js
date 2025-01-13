import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

export function loadConfig(configPath) {
    try {
        const filePath = configPath || path.join(__dirname, '../configs/config.yml');
        const fileContents = fs.readFileSync(filePath, 'utf8');
        return yaml.load(fileContents);
    } catch (e) {
        console.error('Failed to load config file:', e);
        return null;
    }
}