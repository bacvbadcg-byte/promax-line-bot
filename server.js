const express = require("express")
const line = require("@line/bot-sdk")

const app = express()

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}

const client = new line.Client(config)

app.post("/webhook", line.middleware(config), (req, res) => {
  req.body.events.forEach(async e => {
    if (e.type === "message") {
      await client.replyMessage(e.replyToken, {
        type: "text",
        text: "🔥 PRO MAX ทำงานแล้ว"
      })
    }
  })
  res.sendStatus(200)
})

app.get("/", (req,res)=>res.send("PROMAX RUNNING"))

const PORT = process.env.PORT || 3000
app.listen(PORT, ()=> console.log("RUNNING"))
