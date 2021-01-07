# Mockingbird

## Description

テキストチャットに投稿された文章を読み上げるDiscord BOTです。<br>
読み上げ音声は `Google Text-To-Speech` により合成したものを用いています。

保有するVPSのようなサーバ上や、手元のPCのような環境で実行するオンプレミスなアプリケーションのため、
ピークタイムであっても快適な音声読み上げ機能を導入することが可能です。

このBOTを運用するためにはDiscordのBOTの登録の他、Google Cloud Platformに登録し、Google Text-To-Speechを有効にする必要があります。<br>
（2020/08現在、TTSは100万文字の合成まで無料（wavenet合成を用いた場合）で、1年間300ドル分の無料クレジットが付くため身内で利用する分にはほぼほぼ課金は発生しません）

### Commands

コマンドは `##` から始まります。

|コマンド名|概要|例|
|:-|:-|:-|
|`##join`|現在いる音声チャットにMockingbirdを接続します|`##join`|
|`##leave`|音声チャットに接続しているMockingbirdを切断します|`##leave`|
|`##setvoice <type> <pitch> <speed>`|自分の声を設定します。Voice Settingsの項を参照してください|`##setvoice wa 1.1 1.2`|
|`##myvoice`|現在の自分の声色を確認します|`##myvoice`|
|`##learn <word> <mean>`|読み上げの単語登録を行います（絵文字等を登録すると良いです）|`#learn :rabbit: うさうさ`|
|`##rm <word>`|登録した単語を削除します（部分一致であることに注意してください）|`##rm :rabbit:`|
|`##dump`|登録している単語のリストをjson形式で取得します。同時に登録されている単語の数もわかります|`##dump`|
|`##hasty`|他の人がテキストチャットに発言した場合に、読み上げている最中の音声を切り上げるモードに切り替えます|`##hasty`|
|`##lazy`|他の人がテキストチャットに発言した場合でも、読み上げている最中の音声を切り上げないモードに切り替えます|`##lazy`|
|`##dice <個数>d<最大出目>`|最大10個までダイスを振ることができます|`##dice 1d6`|
|`s`または`stop`|読み上げている最中の音声を停止します|`stop`|

この他の規則として、`http`が含まれる発言は発声しないという仕様があります。

### Voice Settings

`##myvoice`コマンドを用いることにより自分の声を設定することが出来ます。

```
##setvoice <type> <pitch> <speed>

type:
sa: 通常音声 女性(1)
sb: 通常音声 女性(2)
sc: 通常音声 男性(1)
sd: 通常音声 男性(2)
wa: 機械学習音声 女性(1)
wb: 機械学習音声 女性(2)
wc: 機械学習音声 男性(1)
wd: 機械学習音声 男性(2)

pitch:
-20.0~20.0

speed:
0.25~4.0

[例]
##setvoice sa 1.0 1.0
```

声色の確認は下記のURL中で出来ます
https://cloud.google.com/text-to-speech?hl=ja

## Deploy

Mockingbirdのセットアップと起動方法は以下のURLを参照してください。
適切なセットアップを行う事で、Windows環境で、使うときのみ起動といったことも可能なので是非使ってみてください。

[Mockingbirdのセットアップと起動方法](https://scrapbox.io/azurite-tech-note/Mockingbird%E3%81%AE%E3%82%BB%E3%83%83%E3%83%88%E3%82%A2%E3%83%83%E3%83%97%E3%81%A8%E8%B5%B7%E5%8B%95%E6%96%B9%E6%B3%95)

## Startup

Google Cloud Platform より取得した `gcp_key.json` を適当な配置し、そこへのパスを特定の環境変数として設定し起動します。

```
GOOGLE_APPLICATION_CREDENTIALS="/path/to/gcp_key.json" node .
```

永続化したい場合はforeverモジュールなど使ってください。
