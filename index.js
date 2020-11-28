const inquirer = require('inquirer');
const axios = require('axios');
const fs = require('fs');
const spawn = require('child_process').spawn;
const psList = require('ps-list');

let config;

try {
    config = require('./config.json');
} catch (err) {
    console.error('Config file is missing.')
    process.exit(1);
} 

const url = config.url;
let groups = [];
let vlc;

const groupQuestion = [
    {
        type: 'search-list',
        message: 'Please select group',
        name: 'group',
        choices: groups,
        pageSize: 30
    }
];

const playList = {};


inquirer.registerPrompt('search-list', require('inquirer-search-list'));

async function downloadM3U() {
    try {
        console.log('Playlist updating...');
        const res = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });
        res.data.pipe(fs.createWriteStream('./tmp/playlist.m3u'));
    } catch (err) {
        console.log(err);
    }
}

async function parseFile() {
    let result = fs.readFileSync('./tmp/playlist.m3u', 'utf-8');
    result = result.split(/\r?\n/);
    result.splice(0, 1);
    let obj = {};
    for (let line of result) {
        if (line.indexOf('#EXTINF:') > -1) {
            line = line.split(',')[0];
            const pattern = /".*?"/g;
            let data = [];
            while(current = pattern.exec(line)) {
                data.push(current[0]);
            }
            let group = data[3];
            if (group !== undefined) {
                group = group.replace('"', '').replace('"', '');
                obj.group = group;
                obj.name = data[1].replace('"', '').replace('"', '');
            }
        } else {
            if (playList[obj.group] === undefined) {
                playList[obj.group] = [];
            }
            playList[obj.group].push({
                name: obj.name,
                url: line
            });
            obj = {};
        }
    }
}

async function questions(grp, def) {
    const geri = {name: ' <<<<< Back <<<<<', value: 'back'};
    let list = playList[grp].map(itm => ({name: itm.name, value: itm.url}));
    list.splice(0, 0, geri);
    answ = await inquirer.prompt({
        type: 'search-list',
        message: 'Please select channel',
        name: 'url',
        choices: list,
        pageSize: 30
    });
    if (answ.url === 'back') {
        let answ = await inquirer.prompt(groupQuestion);
        await questions(answ.group);
    } else {
        try {
            const plists = await psList();
            for (let p of plists) {
                if (p.cmd.indexOf('vlc') > -1 || p.cmd.indexOf('VLC') > -1) {
                    spawn('kill', [p.pid]);
                }
            }
            vlc.stdin.pause();
            vlc.kill();
        } catch (err) {}
        vlc = spawn(config.vlcPath, [answ.url, '--fullscreen']);
        await questions(grp, answ.url);
    }
}

async function init() {
    try {
        const stat = fs.statSync('./tmp/playlist.m3u');
        const mtime = new Date(stat.mtime);
        const now = new Date();
        const diffHours = (((now - mtime) / 1000) / 60) / 60;
        if (diffHours >= 1) {
            await downloadM3U();
        }
    } catch (err) {
        await downloadM3U();
    }
    await parseFile();
    for (let g in playList) {
        groups.push(g);
    }
    let answ = await inquirer.prompt(groupQuestion);
    await questions(answ.group);
}

init();