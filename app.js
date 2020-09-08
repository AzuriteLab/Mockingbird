const uuid = require('uuid')
const async = require('async');
const util = require('util');
const textToSpeech = require('@google-cloud/text-to-speech');
const Discord = require('discord.js');
const CommandDispatcher = require('./libs/command_dispatcher')

const fs = require('fs');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

const system_settings = {
    voice_types: {
        "sa": "ja-JP-Standard-A",
        "sb": "ja-JP-Standard-B",
        "sc": "ja-JP-Standard-C",
        "sd": "ja-JP-Standard-D",
        "wa": "ja-JP-Wavenet-A",
        "wb": "ja-JP-Wavenet-B",
        "wc": "ja-JP-Wavenet-C",
        "wd": "ja-JP-Wavenet-D",
    },
    default_voice_type: "ja-JP-Wavenet-A",
    default_pitch: "1.0",
    default_speed: "1.1",
    max_character_num: 100,
};

const discord_client = new Discord.Client();
const tts_client = new textToSpeech.TextToSpeechClient();
const command_dispatcher = new CommandDispatcher();

if (!fs.existsSync("./app_settings.json", "utf8")) {
    const default_app_settings_structure = {
        "discord_token": ""
    };
    fs.writeFileSync("./app_settings.json", JSON.stringify(default_app_settings_structure));
    console.log("need to edit app_settings.json and add the token.");
    return;
}
const app_settings = JSON.parse(fs.readFileSync("./app_settings.json", "utf8"));

if (!fs.existsSync("./dictionary.json", "utf8")) {
    const default_dictionary_structure = {
        "words": []
    };
    fs.writeFileSync("./dictionary.json", JSON.stringify(default_dictionary_structure));
}
var dictionary = JSON.parse(fs.readFileSync("./dictionary.json", "utf8"));

var rapid_mode = false;
var connection = null;
var dispatcher = null;
var current_playing = "";
var message_requests = [];
var target_channel_id = null;
var current_member_num = 0;
var current_processing_chars = 0;

const on_finish_proc = async (cond) => {
    if (!cond) {
        try {
            if (!current_playing.match(/login_voices/)) {
                await readFile(current_playing);
                await unlink(current_playing); 
            }
        } catch (err) {}

        if (message_requests.length > 0) {
            const next = message_requests.pop();
            current_playing = next;
            let next_disp = connection.play(next);
            next_disp.on("speaking", on_finish_proc);
        } else {
            dispatcher = null;
        }
    }
}
const quote = (str) => {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
const clamp = (x, a, b) => {
    return Math.min(Math.max(x, a), b);
}

command_dispatcher.on({
    name: "##join",
    expr: (obj) => { return obj.message.member.voice.channel.joinable && obj.message.member.voice.channel},
    do : async (obj) => {
        target_channel_id = obj.message.channel.id;
        connection = await obj.message.member.voice.channel.join();
        obj.message.channel.send("Hi");
    }
});

command_dispatcher.on({
    name: "##leave",
    expr: (obj) =>  { return connection && obj.message.member.voice.channel; },
    do: async (obj) => {
        await connection.disconnect();
        connection = null;
        target_channel_id = null;
        obj.message.channel.send("Bye");
    }
});

command_dispatcher.on({
    name: "##hasty",
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: async (obj) => {
        rapid_mode = true;
        obj.message.channel.send("切り上げモードに移行しました");
    }
});

command_dispatcher.on({
    name: "##lazy",
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        rapid_mode = false;
        obj.message.channel.send("切り上げないモードに移行しました");
    }
});

command_dispatcher.on({
    name: "##dump",
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        obj.message.channel.send("現在登録されている単語の辞書ファイルです", {files: ["dictionary.json"]}); 
        obj.message.channel.send(`現在登録されている単語数: ${dictionary.words.length}`);
    }
});

command_dispatcher.on({
    name: "##count",
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        obj.message.channel.send(`起動してから変換した文字数 ${current_processing_chars}`); 
    }
});

command_dispatcher.on({
    name: "##myvoice",
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        const user_id = obj.message.member.id;
        if (dictionary.voice_settings && dictionary.voice_settings[user_id]) {
            const cvs = dictionary.voice_settings[user_id];
            obj.message.channel.send(`${obj.message.member.displayName} ${cvs.type} Pitch:${cvs.pitch}, Speed:${cvs.speed}`); 
        } else {
            obj.message.channel.send(`音声が登録されていないよ,${obj.message.member.displayName}`); 
        }
    }
});

command_dispatcher.on({
    name: "##dice",
    expr: (obj) => { return obj.args.length == 1 && obj.args[0].match(/^\d+d\d+$/); },
    do: (obj) => {
        const dice_tokens = obj.args[0].split("d");
        const dice_num = clamp(dice_tokens[0], 0, 10);
        const max_dice_count = dice_tokens[1];
        let total_roll = 0;
        let rolls = [];
        for (let i=0; i<dice_num; ++i) {
            const roll = Math.round(Math.random() * max_dice_count);
            rolls.push(roll);
            total_roll += roll;
        }
        obj.message.channel.send(`${obj.message.member.displayName}のダイスロール: ${rolls.join(", ")} - total:${total_roll}`); 
    }
});

command_dispatcher.on({
    name: "##learn",
    expr: (obj) => { return obj.args.length == 2; },
    do: async (obj) => {
        const word = obj.args[0];
        const mean = obj.args[1];
        dictionary.words = dictionary.words.filter(elem => (elem.word != word));
        dictionary.words.push({word: word, mean: mean});
        console.log(dictionary);
        await writeFile("./dictionary.json", JSON.stringify(dictionary));
        obj.message.channel.send(`単語の登録が完了しました: ${word} -> ${mean}`);
    }
});

command_dispatcher.on({
    name: "##setvoice",
    expr: (obj) => { return obj.args.length == 3; },
    do: async (obj) => {
        const type = system_settings.voice_types[obj.args[0]];
        let pitch = parseFloat(obj.args[1]);
        let speed = parseFloat(obj.args[2]);
        if (type && pitch && speed) {
            if (!dictionary.voice_settings) {
                dictionary.voice_settings = {};
            }
            pitch = clamp(pitch, -20.0, 20.0);
            speed = clamp(speed, 0.25, 4.0);
            const user_id = obj.message.member.id;
            dictionary.voice_settings[user_id] = {"type": type, "pitch": pitch, "speed": speed};
            console.log(dictionary.voice_settings);
            await writeFile("./dictionary.json", JSON.stringify(dictionary));
            obj.message.channel.send(`音声設定が完了しました: ${obj.message.member.displayName} ${type} Pitch:${pitch}, Speed:${speed}`);
        } else {
            obj.message.channel.send(`コマンドが間違っています: ${obj.message.member.displayName} ${type} Pitch:${pitch}, Speed:${speed}`);
        }
    }
});

command_dispatcher.on({
    name: "##rm",
    expr: (obj) => { return obj.args.length == 1; },
    do: async (obj) => {
        const word = quote(obj.args[0]);
        const rm_reg = new RegExp(`${word}`, "g");
        dictionary.words = dictionary.words.filter(elem => (!elem.word.match(rm_reg)));
        await writeFile("./dictionary.json", JSON.stringify(dictionary));
        obj.message.channel.send(`登録されている単語を削除しました: ${word}`);
    }
});

discord_client.on('ready', async () => {
      console.log(`Logged in as ${discord_client.user.tag}!`);
});

discord_client.on('message', async (msg) => {
    if (!msg.author.bot) {
        await command_dispatcher.dispatch(msg).then(async (res) => {
            if (res) {
                return;
            }

            if (connection && target_channel_id && target_channel_id == msg.channel.id) {
                let req_msg = msg.content.slice(0, system_settings.max_character_num);
                req_msg = req_msg.replace(/(http|https):\/\/\S+/g, "");
                dictionary.words.forEach((item, index) => {
                    let word = quote(item.word);
                    let regex = new RegExp(`${word}`, 'g');
                    req_msg = req_msg.replace(regex, item.mean);
                });

                let req_pitch = system_settings.default_pitch;
                let req_speed = system_settings.default_speed;
                let req_voice = system_settings.default_voice_type;
                if (dictionary.voice_settings) {
                    const user_voice_setting = dictionary.voice_settings[msg.member.id];
                    if (user_voice_setting) {
                        req_pitch = parseFloat(user_voice_setting.pitch);
                        req_speed = parseFloat(user_voice_setting.speed);
                        req_voice = user_voice_setting.type;
                    }
                }
                current_processing_chars += req_msg.length;
                const filename = `${uuid.v4()}.mp3`;
                const request = {
                    input: {text: req_msg},
                    voice: {languageCode: "ja-JP", name: req_voice},
                    audioConfig: {audioEncoding: 'MP3', pitch: req_pitch, speakingRate: req_speed},
                };
                const [response] = await tts_client.synthesizeSpeech(request);
                await writeFile(filename, response.audioContent, "binary");

                if (rapid_mode || req_msg == "stop" || req_msg == "s") {
                    try {
                        await readFile(current_playing);
                        await unlink(current_playing); 
                    } catch (err) {}
                }
                if (!dispatcher || rapid_mode || req_msg == "stop" || req_msg == "s") {
                    current_playing = filename;
                    dispatcher = connection.play(filename);
                    dispatcher.on("speaking", on_finish_proc);
                } else {
                    message_requests.unshift(filename);
                }
            }
        });
    }
});

discord_client.on("voiceStateUpdate", async (old_state, new_state) => {
    console.log(`Current Processing Chars: ${current_processing_chars}`);
    if (!connection) {
        return;
    }
    let member_num = connection.channel.members.array().length;
    if (connection && member_num == 1) {
        await connection.disconnect();
        connection = null;
        console.log("disconnected");
    }
    if (connection && member_num > current_member_num) {
        const filenames = fs.readdirSync("./login_voices").filter(name => name.match(/\S+\.mp3/));
        const lv_file_name = filenames[Math.floor(Math.random() * filenames.length)];
        const lv_file_path = `./login_voices/${lv_file_name}`;
        if (fs.existsSync(lv_file_path, "utf8")) {
            if (!dispatcher || rapid_mode) {
                current_playing = lv_file_path;
                dispatcher = connection.play(lv_file_path);
                dispatcher.on("speaking", on_finish_proc);
            } else {
                message_requests.unshift(lv_file_path);
            }            
        }       
    }
    current_member_num = member_num;
});

discord_client.login(app_settings.discord_token);
