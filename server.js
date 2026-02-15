const express = require("express")
const line = require("@line/bot-sdk")

const app = express()

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}

const client = new line.Client(config)

let marketOpen = false
let bets = []
let RATE = { "2":100, "3":120, "v":800 }

app.post("/webhook", line.middleware(config), async (req, res) => {
  for (const e of req.body.events) {
    if (e.type !== "message") continue
    const text = e.message.text.trim()
    const uid = e.source.userId

    // OWNER SET
    if (text === "O") {
      marketOpen = true
      return reply(e.replyToken, "🟢 เปิดรับโพย")
    }

    if (text === "X") {
      marketOpen = false
      return reply(e.replyToken, "🔴 ปิดรับโพย")
    }

    if (text.startsWith("SET ")) {
      const win = text.split(" ")[1]
      let totalBet = 0
      let totalPay = 0

      bets.forEach(b => {
        totalBet += b.amount
        if (b.number === win) {
          totalPay += b.amount * RATE[b.type]
        }
      })

      const profit = totalBet - totalPay
      bets = []

      return reply(e.replyToken,
        `🎯 ผล ${win}
ยอดแทง ${totalBet}
ยอดจ่าย ${totalPay}
กำไร ${profit}`)
    }

    if (!marketOpen)
      return reply(e.replyToken, "❌ ตลาดปิด")

    if (text.includes("=")) {
      const [number, amount] = text.split("=")
      const type = number.length === 2 ? "2" :
                   number.length === 3 ? "3" : "v"

      bets.push({
        uid,
        number,
        amount: parseInt(amount),
        type
      })

      return reply(e.replyToken, "✅ รับโพยแล้ว")
    }
  }
  res.sendStatus(200)
})

function reply(token, text) {
  return client.replyMessage(token, { type: "text", text })
}

app.get("/", (req,res)=>res.send("PROMAX RUNNING"))

const PORT = process.env.PORT || 3000
app.listen(PORT, ()=> console.log("PRO MAX RUNNING"))
