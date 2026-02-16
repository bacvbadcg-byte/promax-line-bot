const express = require("express");
const line = require("@line/bot-sdk");
const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const ADMIN_ID = process.env.ADMIN_ID;

let users = {};
let topups = {};
let bets = [];
let roundOpen = false;

app.post("/webhook", line.middleware(config), async (req, res) => {
  const event = req.body.events[0];
  if (!event) return res.sendStatus(200);

  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // สมัคร
  if (event.type === "message" && event.message.type === "text") {
    const text = event.message.text.trim();

    if (text === "สมัคร") {
      if (!users[userId]) {
        users[userId] = { credit: 0 };
        return reply(replyToken, "✅ สมัครสำเร็จ");
      }
      return reply(replyToken, "คุณสมัครแล้ว");
    }

    if (text === "เครดิต") {
      if (!users[userId]) return reply(replyToken, "พิมพ์ สมัคร ก่อน");
      return reply(replyToken, `💰 เครดิต: ${users[userId].credit}`);
    }

    // เติมเงิน
    if (text.startsWith("เติม ")) {
      const amount = parseInt(text.split(" ")[1]);
      if (!users[userId]) return reply(replyToken, "สมัครก่อน");
      if (isNaN(amount)) return reply(replyToken, "จำนวนไม่ถูกต้อง");

      topups[userId] = { amount, status: "pending" };

      return reply(replyToken,
        `💳 แจ้งโอน ${amount} บาท\n📸 กรุณาส่งสลิปในแชทนี้`);
    }

    // แอดมินอนุมัติ
    if (text.startsWith("อนุมัติ ") && userId === ADMIN_ID) {
      const targetId = text.split(" ")[1];
      if (topups[targetId] && topups[targetId].status === "pending") {
        users[targetId].credit += topups[targetId].amount;
        topups[targetId].status = "approved";
        return reply(replyToken, "✅ อนุมัติสำเร็จ");
      }
    }

    // เปิดรอบ
    if (text === "เปิดรอบ" && userId === ADMIN_ID) {
      roundOpen = true;
      bets = [];
      return reply(replyToken, "🟢 เปิดรับเดิมพัน");
    }

    // ออกผล
    if (text.startsWith("ออก ") && userId === ADMIN_ID) {
      const d = text.split(" ")[1];
      return settle(d[0], d[1], d[2], replyToken);
    }

    // รับเดิมพัน
    if (roundOpen) {
      const parts = text.split(" ");
      if (parts.length !== 2) return res.sendStatus(200);

      const bet = parts[0];
      const amount = parseInt(parts[1]);

      if (!users[userId] || users[userId].credit < amount)
        return reply(replyToken, "เครดิตไม่พอ");

      users[userId].credit -= amount;
      bets.push({ userId, bet, amount });

      return flexBet(replyToken, bet, amount);
    }
  }

  // รับรูปสลิป
  if (event.type === "message" && event.message.type === "image") {
    if (topups[userId] && topups[userId].status === "pending") {
      return reply(replyToken,
        "📨 รับสลิปแล้ว รอแอดมินตรวจสอบ");
    }
  }

  res.sendStatus(200);
});

function settle(d1, d2, d3, replyToken) {
  d1 = parseInt(d1);
  d2 = parseInt(d2);
  d3 = parseInt(d3);

  const sum = d1 + d2 + d3;
  const isTriple = d1 === d2 && d2 === d3;
  const isLow = sum >= 4 && sum <= 10;
  const isHigh = sum >= 11 && sum <= 17;

  let text = `🎲 ${d1}-${d2}-${d3}\nรวม ${sum}\n\n`;

  bets.forEach(b => {
    let profit = 0;

    if (b.bet === "ต่ำ" && !isTriple && isLow) profit = b.amount;
    if (b.bet === "สูง" && !isTriple && isHigh) profit = b.amount;

    if (/^[1-6]$/.test(b.bet)) {
      const count = [d1,d2,d3].filter(x=>x==b.bet).length;
      if (count>0) profit = b.amount*1.1*count;
    }

    if (/^[1-6]{2}$/.test(b.bet) && b.bet[0]===b.bet[1]) {
      const count = [d1,d2,d3].filter(x=>x==b.bet[0]).length;
      if (count>=2) profit = b.amount*6;
    }

    if (profit>0) {
      users[b.userId].credit += profit + b.amount;
      text += "✅ มีผู้เล่นชนะ\n";
    } else {
      text += "❌ มีผู้เล่นแพ้\n";
    }
  });

  bets = [];
  roundOpen = false;

  return reply(replyToken, text);
}

function flexBet(token, bet, amount) {
  const client = new line.Client(config);

  return client.replyMessage(token, {
    type: "flex",
    altText: "รับเดิมพันสำเร็จ",
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: "https://i.imgur.com/8Km9tLL.jpg",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "HI-LO PRO", weight: "bold", size: "xl" },
          { type: "text", text: `เดิมพัน: ${bet}`, margin: "md" },
          { type: "text", text: `จำนวน: ${amount}`, margin: "sm" }
        ]
      }
    }
  });
}

async function reply(token, message) {
  const client = new line.Client(config);
  return client.replyMessage(token, {
    type: "text",
    text: message,
  });
}

app.listen(process.env.PORT || 3000);
