# BLE Traffic Monitor

GitHub Pagesで公開できる、受信専用のBLE Advertisementモニターです。HTML/CSS/JavaScriptのみで動作し、バックエンドやビルド工程は不要です。

## 機能

- Web Bluetooth APIによるデバイス選択とAdvertisement監視
- RSSI、Tx Power、Advertised UUIDの表示
- Manufacturer Data / Service DataのHEX・バイト列表示
- 受信イベント一覧、詳細インスペクター、JSON表示
- RSSI推移チャート
- CSVエクスポート
- ローカルブラウザ内での処理（データ送信先なし）

## GitHub Pagesで公開

1. GitHubで新しいリポジトリを作成します（例: `ble-traffic-monitor`）。
2. `index.html`、`styles.css`、`app.js`、`README.md` をリポジトリのルートにアップロードします。
3. リポジトリの **Settings → Pages** を開きます。
4. **Build and deployment → Deploy from a branch** を選択します。
5. Branchを `main`、Folderを `/ (root)` にして保存します。
6. 数分後に表示される `https://<ユーザー名>.github.io/ble-traffic-monitor/` を開きます。

## 動作環境と制約

- Web Bluetoothは安全なコンテキスト（HTTPSまたはlocalhost）で利用します。
- Web Bluetoothの対応状況はブラウザ・OS・Bluetoothアダプターに依存します。デスクトップ版Chrome/Edgeを第一候補にしてください。
- `watchAdvertisements()` は実験的・限定的なAPIです。ブラウザのバージョンやOSによって利用できない場合があります。
- ブラウザの許可ダイアログで選択したデバイスの広告イベントを監視します。周辺のすべてのBLE広告を無差別にスキャンする汎用スニファーではありません。
- タブを閉じたり、OSがバックグラウンド動作を制限したりすると受信は止まります。
- iOS Safariなど、Web Bluetooth非対応環境では動作しません。

## 高度化PICSについて

このプロジェクトは、標準的な広告イベントのメタデータと取得可能なManufacturer Data / Service Dataを表示します。高度化PICS固有のフィールド、信号状態、交差点情報などは、正式な仕様書に基づくデコーダーを追加するまで解釈しません。

正確なデコーダーを実装するには、少なくとも次の情報が必要です。

- 広告の識別方法（Service UUID、Company Identifier等）
- ペイロードのフィールド定義とバイトオフセット
- バイト順、ビット定義、単位、値域
- バージョン識別やチェックサムの有無

`app.js` の `packetToRecord()` と `renderDetail()` がデータ処理・表示の主な拡張ポイントです。公式仕様を確認したうえで、プロトコルアダプターを追加してください。

## セキュリティ・安全設計

- 受信・表示専用です。GATT接続、書き込み、信号制御コマンドは実装していません。
- 受信データは外部へ送信しません。CSV出力は利用者がボタンを押したときにローカルへ保存します。
- 実際の交通信号設備や道路上での利用は、管理者の許可・適用される法令・安全ルールに従ってください。
- RSSIは周辺環境やアンテナ特性で変化するため、距離の正確な推定には使えません。

## ローカルで確認

Web Bluetoothはlocalhostでも利用できる場合があります。`index.html`を直接 `file://` で開くのではなく、ローカルHTTPサーバーで配信してください。例:

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。
