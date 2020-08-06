const uuid = require('uuid')
const async = require('async');
const util = require('util');
const textToSpeech = require('@google-cloud/text-to-speech');
const Discord = require('discord.js');

const fs = require('fs');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

const discord_client = new Discord.Client();
const tts_client = new textToSpeech.TextToSpeechClient();

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
var on_finish_proc = async (cond) => {
    if (!cond) {
        try {
            await readFile(current_playing);
            await unlink(current_playing); 
        } catch (err) {}

        if (message_requests.length > 0) {
            const next = message_requests.pop();
            current_playing = next;
            var next_disp = connection.play(next);
            next_disp.on("speaking", on_finish_proc);
        } else {
            dispatcher = null;
        }
    }
}

const quote = (str) => {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

discord_client.on('ready', async () => {
      console.log(`Logged in as ${discord_client.user.tag}!`);
});

var connection = null;
discord_client.on('message', async (msg) => {
    if (!msg.author.bot) {
        if (msg.content == "##join" && msg.member.voice.channel.joinable && msg.member.voice.channel) {
            connection = await msg.member.voice.channel.join();
            msg.channel.send("Hi");
            return;
        }
        if (msg.content == "##leave" && connection && msg.member.voice.channel) {
            await connection.disconnect();
            connection = null;
            msg.channel.send("Bye");
            return;
        }
        if (msg.content == "##rapid" && connection && msg.member.voice.channel) {
            rapid_mode = true;
            msg.channel.send("切り上げモードに移行しました");
            return;
        }
        if (msg.content == "##lazy" && connection && msg.member.voice.channel) {
            rapid_mode = false;
            msg.channel.send("切り上げないモードに移行しました");
            return;
        }
        if (msg.content == "##dump" && connection && msg.member.voice.channel) {
            msg.channel.send("現在登録されている単語の辞書ファイルです", {files: ["dictionary.json"]}); 
            msg.channel.send(`現在登録されている単語数: ${dictionary.words.length}`);
            return;
        }
        if (msg.content.match(/^##learn \S+ \S+$/)) {
            const tokens = msg.content.split(" ");
            const word = tokens[1];
            const mean = tokens[2];
            dictionary.words = dictionary.words.filter(obj => (obj.word != word));
            dictionary.words.push({word: word, mean: mean});
            console.log(dictionary);
            await writeFile("./dictionary.json", JSON.stringify(dictionary));
            msg.channel.send(`単語の登録が完了しました: ${word} -> ${mean}`);
            return;
        }
        if (msg.content.match(/^##rm \S+$/)) {
            const tokens = msg.content.split(" ");
            const word = quote(tokens[1]);
            const rm_reg = new RegExp(`${word}`, "g");
            dictionary.words = dictionary.words.filter(obj => (!obj.word.match(rm_reg)));
            await writeFile("./dictionary.json", JSON.stringify(dictionary));
            msg.channel.send(`登録されている単語を削除しました: ${word}`);
            return;
        }
        if (msg.content.match(/^##/)) {
            msg.channel.send("コマンドが間違っています")
            return;
        }
        if (msg.content.match(/http/g)) {
            return
        }
        if (connection) {
            var req_msg = msg.content.slice(0, 100);
            dictionary.words.forEach((item, index) => {
                var word = quote(item.word);
                var regex = new RegExp(`${word}`, 'g');
                req_msg = req_msg.replace(regex, item.mean);
            });
            const filename = `${uuid.v4()}.mp3`;
            const request = {
                input: {text: req_msg},
                voice: {languageCode: "ja-JP", name: 'ja-JP-Wavenet-A', ssmlGender: 'FEMALE', pitch: 2},
                audioConfig: {audioEncoding: 'MP3'},
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
    }
});

discord_client.login(app_settings.discord_token);
