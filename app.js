const uuid = require('uuid')
const async = require('async');
const util = require('util');
const textToSpeech = require('@google-cloud/text-to-speech');
const {Client, Intents} = require('discord.js');
const {createAudioResource, entersState, VoiceConnectionStatus, generateDependencyReport, joinVoiceChannel, getVoiceConnections, createAudioPlayer} = require('@discordjs/voice');
const CommandDispatcher = require('./libs/command_dispatcher')

console.log(generateDependencyReport());

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

var argv = require('argv');
argv.option([
	{
		"name": "token",
		"short": "t",
		"type": "string"
	},
	{
		"name": "prefix",
		"short": "p",
		"type": "string"
	}
]);
var parsed_argv = argv.run();
console.log(parsed_argv.options);

const discord_client = new Client({intents: 
    [
        "GUILD_VOICE_STATES",
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_VOICE_STATES,
    ]
});
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

var prefix = parsed_argv.options.prefix;
var rapid_mode = false;
var connection = null;
var player = null;
var current_playing = "";
var message_requests = [];
var target_channel_id = null;
var target_voice_channel = null;
var current_member_num = 0;
var current_processing_chars = 0;

const on_finish_proc = async (oldState, newState) => {
    //console.log(`Finish : ${oldState.status} => ${newState.status} (${current_playing})`);
    if ((oldState.status == 'buffering' || oldState.status == 'playing') && (newState.status == 'idle' || newState.status == 'paused' || newState.status == 'autopaused')) {
        // この関数は1度のリクエストで複数回の同一の遷移情報が送られてくる場合がある
        // その場合を考慮し、各リクエストで一度のみ処理を行うようにしている
        try {
            if (!current_playing.match(/login_voices/) && fs.existsSync(current_playing)) {
                await readFile(current_playing);
                await unlink(current_playing); 
            }
        } catch (err) {}

        if (message_requests.length > 0) {
            const next = message_requests.pop();
            current_playing = next;
            let resource = createAudioResource(next);
            player.play(resource);
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
    name: `${prefix}join`,
    expr: (obj) => { return obj.message.member.voice.channel.joinable && obj.message.member.voice.channel},
    do : async (obj) => {
        target_channel_id = obj.message.channel.id;
        target_voice_channel = obj.message.member.voice.channel;

        player = createAudioPlayer();
        player.on('stateChange', on_finish_proc);

        const channel = obj.message.channel;
        connection = joinVoiceChannel({
            channelId: target_voice_channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 1000);
        } catch (error) {
            console.log(error);
            connection.disconnect();
        }
        console.log(channel);
        console.log(connection);
        connection.subscribe(player);

        obj.message.channel.send("Hi");
    }
});

command_dispatcher.on({
    name: `${prefix}leave`,
    expr: (obj) =>  { return connection && obj.message.member.voice.channel; },
    do: async (obj) => {
        await connection.disconnect();
        connection = null;
        target_channel_id = null;
        obj.message.channel.send("Bye");
    }
});

command_dispatcher.on({
    name: `${prefix}hasty`,
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: async (obj) => {
        rapid_mode = true;
        obj.message.channel.send("切り上げモードに移行しました");
    }
});

command_dispatcher.on({
    name: `${prefix}lazy`,
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        rapid_mode = false;
        obj.message.channel.send("切り上げないモードに移行しました");
    }
});

command_dispatcher.on({
    name: `${prefix}dump`,
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        obj.message.channel.send("現在登録されている単語の辞書ファイルです", {files: ["dictionary.json"]}); 
        obj.message.channel.send(`現在登録されている単語数: ${dictionary.words.length}`);
    }
});

command_dispatcher.on({
    name: `${prefix}count`,
    expr: (obj) => { return connection && obj.message.member.voice.channel; },
    do: (obj) => {
        obj.message.channel.send(`起動してから変換した文字数 ${current_processing_chars}`); 
    }
});

command_dispatcher.on({
    name: `${prefix}myvoice`,
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
    name: `${prefix}dice`,
    expr: (obj) => { return obj.args.length == 1 && obj.args[0].match(/^\d+d\d+$/); },
    do: (obj) => {
        const dice_tokens = obj.args[0].split("d");
        const dice_num = clamp(dice_tokens[0], 0, 10);
        const max_dice_count = dice_tokens[1];
        if (max_dice_count <= 0) {
            obj.message.channel.send(`${obj.message.member.displayName}のダイスロール: 出目が1以上のダイスを指定してください。`); 
            return;
        }

        let total_roll = 0;
        let rolls = [];
        for (let i=0; i<dice_num; ++i) {
            const roll = Math.round(Math.random() * (max_dice_count-1)) + 1;
            rolls.push(roll);
            total_roll += roll;
        }
        obj.message.channel.send(`${obj.message.member.displayName}のダイスロール: ${rolls.join(", ")} - total:${total_roll}`); 
    }
});

command_dispatcher.on({
    name: `${prefix}learn`,
    expr: (obj) => { return obj.args.length == 2; },
    do: async (obj) => {
        const word = obj.args[0];
        const mean = obj.args[1];
        if (word == " " || mean == " " || word == "" || mean == "") {
            obj.message.channel.send(`無効な文字が入力されました`);
            return;
        }
        dictionary.words = dictionary.words.filter(elem => (elem.word != word));
        dictionary.words.push({word: word, mean: mean});
        console.log(dictionary);
        await writeFile("./dictionary.json", JSON.stringify(dictionary));
        obj.message.channel.send(`単語の登録が完了しました: ${word} -> ${mean}`);
    }
});

command_dispatcher.on({
    name: `${prefix}setvoice`,
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
    name: `${prefix}rm`,
    expr: (obj) => { return obj.args.length == 1; },
    do: async (obj) => {
        const word = quote(obj.args[0]);
        const rm_reg = new RegExp(`${word}`, "g");
        dictionary.words = dictionary.words.filter(elem => (!elem.word.match(rm_reg)));
        await writeFile("./dictionary.json", JSON.stringify(dictionary));
        obj.message.channel.send(`登録されている単語を削除しました: ${word}`);
    }
});

command_dispatcher.on({
    name: `${prefix}setwav`,
    expr: (obj) => { return obj.args.length == 1 && obj.message.attachments.array().length == 1; },
    do: async (obj) => {
        const word = quote(obj.args[0]);
        const attachment = obj.message.attachments.array()[0];
        obj.message.channel.send(`${util.inspect(attachment)}`);
    }
});

discord_client.on('ready', async () => {
      console.log(`Logged in as ${discord_client.user.tag}!`);
});

discord_client.on('messageCreate', async (msg) => {
    if (!msg.author.bot) {
        await command_dispatcher.dispatch(msg).then(async (res) => {
            if (res) {
                return;
            }

            if (connection && target_channel_id && target_channel_id == msg.channel.id) {
                let req_msg = msg.content.replace(/((http|https):\/\/\S+)|(<@\S+>)/g, "");
                dictionary.words.forEach((item, index) => {
                    let word = quote(item.word);
                    let regex = new RegExp(`${word}`, 'g');
                    req_msg = req_msg.replace(regex, item.mean);
                });
                req_msg = req_msg.slice(0, system_settings.max_character_num);

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
                if (player.state.status == "idle" || rapid_mode || req_msg == "stop" || req_msg == "s") {
                    current_playing = filename;
                    let resource = createAudioResource(filename);
                    player.play(resource);
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
    let member_num = target_voice_channel.members.size;
    if (connection && member_num == 1) {
        await connection.disconnect();
        connection = null;
        console.log("disconnected");
    }
    if (connection && member_num > current_member_num) {
        const filenames = fs.readdirSync("./login_voices").filter(name => name.match(/\S+\.(mp3|ogg|wav)/));
        const lv_file_name = filenames[Math.floor(Math.random() * filenames.length)];
        const lv_file_path = `./login_voices/${lv_file_name}`;
        if (fs.existsSync(lv_file_path, "utf8")) {
            if ((player.state.status == "idle") || rapid_mode) {
                current_playing = lv_file_path;
                let resource = createAudioResource(lv_file_path);
                player.play(resource);
            } else {
                message_requests.unshift(lv_file_path);
            }            
        }       
    }
    current_member_num = member_num;
});

discord_client.login(parsed_argv.options.token);
