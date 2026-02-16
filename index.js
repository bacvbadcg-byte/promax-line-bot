const express = require("express");
const line = require("@line/bot-sdk");
const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const ADMIN_ID = process.env.ADMIN_ID;

// โครงสร้างข้อมูลแยกตามกลุ่ม
let groups = {};

app.post("/webhook", line.middleware(config), async (req, res) => {
  const event = req.body.events[0];
  if (!event) return res.sendStatus(200);

  if (event.source.type !== "group")
    return reply(event.replyToken, "❌ ใช้งานได้เฉพาะในกลุ่มเท่านั้น");

  const groupId = event.source.groupId;
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!groups[groupId]) {
    groups[groupId] = {
      users: {},
      bets: [],
      topups: {},
      roundOpen: false
    };
  }

  const group = groups[groupId];

  if (event.type === "message" && event.message.type === "text") {
    const text = event.message.text.trim();

    // สมัคร
    if (text === "สมัคร") {
      if (!group.users[userId]) {
        group.users[userId] = { credit: 0 };
        return reply(replyToken, "✅ สมัครสำเร็จ (กลุ่มนี้)");
      }
      return reply(replyToken, "คุณสมัครแล้ว");
    }

    // เครดิต
    if (text === "เครดิต") {
      if (!group.users[userId]) return reply(replyToken, "สมัครก่อน");
      return reply(replyToken, `💰 เครดิต: ${group.users[userId].credit}`);
    }

    // เติมเงิน
    if (text.startsWith("เติม ")) {
      const amount = parseInt(text.split(" ")[1]);
      if (!group.users[userId]) return reply(replyToken, "สมัครก่อน");
      if (isNaN(amount)) return reply(replyToken, "จำนวนไม่ถูกต้อง");

      group.topups[userId] = { amount, status: "pending" };
      return reply(replyToken, `💳 แจ้งโอน ${amount}\n📸 ส่งสลิปในกลุ่มนี้`);
    }

    // อนุมัติ
    if (text.startsWith("อนุมัติ ") && userId === ADMIN_ID) {
      const target = text.split(" ")[1];
      if (group.topups[target]?.status === "pending") {
        group.users[target].credit += group.topups[target].amount;
        group.topups[target].status = "approved";
        return reply(replyToken, "✅ เติมเงินสำเร็จ");
      }
    }

    // เปิดรอบ
    if (text === "เปิดรอบ" && userId === ADMIN_ID) {
      group.roundOpen = true;
      group.bets = [];
      return reply(replyToken, "🟢 เปิดรอบ (กลุ่มนี้)");
    }

    // ออกผล
    if (text.startsWith("ออก ") && userId === ADMIN_ID) {
      const d = text.split(" ")[1];
      return settle(group, d[0], d[1], d[2], replyToken);
    }

    // รับเดิมพัน
    if (group.roundOpen) {
      const parts = text.split(" ");
      if (parts.length !== 2) return res.sendStatus(200);

      const bet = parts[0];
      const amount = parseInt(parts[1]);

      if (!group.users[userId] || group.users[userId].credit < amount)
        return reply(replyToken, "เครดิตไม่พอ");

      group.users[userId].credit -= amount;
      group.bets.push({ userId, bet, amount });

      return flexBet(replyToken, bet, amount);
    }
  }

  if (event.type === "message" && event.message.type === "image") {
    if (group.topups[userId]?.status === "pending")
      return reply(replyToken, "📨 รับสลิปแล้ว รอแอดมินอนุมัติ");
  }

  res.sendStatus(200);
});

function settle(group, d1, d2, d3, replyToken) {
  d1 = parseInt(d1);
  d2 = parseInt(d2);
  d3 = parseInt(d3);

  const sum = d1 + d2 + d3;
  const isTriple = d1 === d2 && d2 === d3;
  const isLow = sum >= 4 && sum <= 10;
  const isHigh = sum >= 11 && sum <= 17;

  let text = `🎲 ${d1}-${d2}-${d3} (กลุ่มนี้)\nรวม ${sum}\n\n`;

  group.bets.forEach(b => {
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
      group.users[b.userId].credit += profit + b.amount;
      text += "✅ มีผู้เล่นชนะ\n";
    } else {
      text += "❌ มีผู้เล่นแพ้\n";
    }
  });

  group.bets = [];
  group.roundOpen = false;

  return reply(replyToken, text + "\n🔒 ปิดรอบอัตโนมัติ");
}

function flexBet(token, bet, amount) {
  const client = new line.Client(config);
  return client.replyMessage(token, {
    type: "flex",
    altText: "รับเดิมพันสำเร็จ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "HI-LO GROUP", weight: "bold", size: "xl" },
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
