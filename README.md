# 出遊記帳 App

多人即時同步的旅行記帳 PWA，資料存在 Google Sheets。

## 快速開始

1. 複製 `.env.example` 為 `.env`，填入你的 Google Client ID
2. `npm install`
3. `npm start`

## 部署

詳見「出遊App部署說明.docx」

## 功能

- Google 帳號登入
- 建立帳本（自動建立 Google Sheet）
- 新增消費（日幣/台幣、消費方式、由誰付、分類）
- 即時同步（透過 Google Sheets API）
- 邀請旅伴共同記帳
- 自動分帳計算、日幣匯率調整
- PWA 可加入手機主畫面
