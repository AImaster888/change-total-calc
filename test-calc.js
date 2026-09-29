// 從 index.html 實際抽出計算函式來測，不是抄一份
const fs = require("fs");
const html = fs.readFileSync("D:/320code/change-total-calc/index.html", "utf8");
const src = html.slice(html.indexOf('<script type="text/babel">') + 26, html.indexOf("function App()"));
const body = src
  .replace(/const \{ useState[^\n]*\n/, "")
  .replace(/^const EXAMPLE[^\n]*$/m, "");
const mod = new Function(body + "\nreturn { p, cut2, calcLeft, calcRight, calcNewItemTax, getWarnings, parseCSV, csvToState, csvToHistory, migrateRecord };")();
const { cut2, calcLeft, calcRight, calcNewItemTax, getWarnings, p, parseCSV, csvToState, csvToHistory, migrateRecord } = mod;

let pass = 0, fail = 0;
const t = (name, actual, expect) => {
  const ok = Object.is(actual, expect);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      得 ${actual} ／ 期望 ${expect}`);
  ok ? pass++ : fail++;
};

console.log("=== 高風險 bug：997100/2900 佔比與分攤 ===");
{
  const lv = calcLeft({ A1:"25000000", A2:"997100", A3:"0", A4a:"2900", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0" });
  const ni = calcNewItemTax(lv, {});
  t("B1", lv.B1, 1000000);
  t("A5 承商利潤", lv.A5, 100000);
  t("佔比 ratioPct（修前為 0.28）", ni.ratioPct, 0.29);
  t("012 分攤（修前為 280.00000000000006）", ni.formulaShare012, 290);
}

console.log("\n=== 反例：0.289999999 不得被進位 ===");
{
  const lv = calcLeft({ A1:"0", A2:"99.710000001", A3:"0", A4a:"0.289999999", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0" });
  t("佔比應為 0.28", calcNewItemTax(lv, {}).ratioPct, 0.28);
}

console.log("\n=== 邊界：700.07/2100.21 應為 75.00 ===");
{
  const lv = calcLeft({ A1:"0", A2:"700.07", A3:"0", A4a:"2100.21", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0" });
  t("佔比應為 75", calcNewItemTax(lv, {}).ratioPct, 75);
}

console.log("\n=== 各項一律無條件捨去 2 位（不做四捨五入）===");
{
  const lv = calcLeft({ A1:"25000000", A2:"1350000.55", A3:"-820000.35", A4a:"650000.8", A4b:"0", A5pct:"10", A6:"11800.1", A7:"23600.2", A8:"0", C1:"10000" });
  t("B1", lv.B1, 1180001);
  t("A5 = B1×10% 捨去2位", lv.A5, 118000.1);
  t("B2（修前 1333401.4000000001）", lv.B2, 1333401.4);
  t("B3 = B2×5% 捨去2位", lv.B3, 66670.07);
  t("B4", lv.B4, 1400071.47);
  t("B5 不做四捨五入，維持 2 位", lv.B5, 26400071.47);
  const ni = calcNewItemTax(lv, {});
  t("012 分攤捨去2位（修前 64994.45508）", ni.formulaShare012, 64994.45);
  t("含稅小計捨去2位", ni.totalWithTax, 750745.01);
  t("含稅金額捨去至整數", ni.totalFinal, 750745);
}

console.log("\n=== 稅金檢核 gate：B1>0 但 B2=0 時不得放行 ===");
{
  const lv = calcLeft({ A1:"0", A2:"100", A3:"0", A4a:"0", A4b:"0", A5pct:"0", A6:"0", A7:"0", A8:"0" });
  const rv = calcRight(lv, { A6:"-100", B3:"1" });
  t("B1", rv.B1, 100);
  t("B2", rv.B2, 0);
  const w = getWarnings(rv);
  t("B3 違規應有警告（修前為 undefined 漏檢）", w.B3 !== undefined, true);
}

console.log("\n=== Infinity 不再汙染計算鏈 ===");
{
  t("p('1e309')", p("1e309"), 0);
  const lv = calcLeft({ A1:"1e309", A2:"100", A3:"0", A4a:"0", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0" });
  t("B5 為有限數（修前為 Infinity）", Number.isFinite(lv.B5), true);
}

console.log("\n=== 調整走 012／0B 欄位（手動覆寫）===");
{
  const lv = calcLeft({ A1:"25000000", A2:"1350000.55", A3:"-820000.35", A4a:"650000.8", A4b:"0", A5pct:"10", A6:"11800.1", A7:"23600.2", A8:"0" });
  const rv = calcRight(lv, { A5:"118000.09" });          // 012 承商利潤手動下修 0.01
  t("012 調整後 A5", rv.A5, 118000.09);
  t("B2 隨之重算", rv.B2, 1333401.39);
  const ni = calcNewItemTax(lv, { share012: "64994.44" }); // 0B 分攤手動下修
  t("012 分攤覆寫值捨去2位", ni.share012, 64994.44);
  t("含稅金額隨覆寫重算", ni.totalFinal, Math.floor(ni.totalWithTax));
}

console.log("\n=== cut2 取位性質（浮點防線需不隨金額量級失效）===");
{
  t("大金額加總不掉分", cut2(25000000 + 1400071.47), 26400071.47);
  t("小數浮點尾差", cut2(0.1 + 0.2), 0.3);
  t("1333401.4000000001", cut2(1333401.4000000001), 1333401.4);
  t("真實值 0.289999999 不進位", cut2(0.289999999), 0.28);
  t("0.29 不被誤捨", cut2(0.29), 0.29);
  t("負數捨去朝零", cut2(-118000.109), -118000.1);
  t("小於一分捨為 0", cut2(0.009), 0);
  t("億級金額", cut2(123456789.019), 123456789.01);
}

console.log("\n=== 追減（負值）方向 ===");
{
  const lv = calcLeft({ A1:"1000000", A2:"0", A3:"-50000.559", A4a:"0", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0" });
  t("B1 捨去朝零", lv.B1, -50000.55);
  t("A5 追減為負", lv.A5, -5000.05);
}

console.log("\n=== CSV 匯入：「匯出目前計算表」還原（fixture 為實際匯出檔內容）===");
// 這份 fixture 的 A5 與 B3 是手動下修過的，其餘欄位左右相同
const CUR_CSV = '﻿' + [
  '"案件名稱","（未命名）"',
  '"匯出時間","2026/7/27 下午4:13:57"',
  '',
  '"項目","初算值","調整值","差額","驗證訊息"',
  '"A1. 原契約金額","1960000","1960000","",""',
  '"A2. 原契約工項追加金額","103285.45","103285.45","",""',
  '"A3. 原契約工項減少金額","-171013.68","-171013.68","",""',
  '"A4a. 新增項目（不議價）","576399","576399","",""',
  '"A4b. 新增項目（議價）","0","0","",""',
  '"A4. 新增項目總額（自動計算）","576399","576399","",""',
  '"B1. 變更項目總和 (A2+A3+A4)","508670.77","508670.77","",""',
  '"A5. 承商利潤率 (%)","10","","",""',
  '"A5. 012承商利潤 (金額)","50867.07","50855.61","-11.46",""',
  '"A6. 013職安衛費用","0","0","",""',
  '"A7. 014材料檢試驗費用","5086.62","5086.62","",""',
  '"B2. 變更總金額 (B1+A5+A6+A7)","564624.46","564613","-11.46",""',
  '"B3. 營業稅 (B2×5%)","28231.22","28231","-0.22","追加時稅金超過上限 28,230.65"',
  '"B4. 變更金額 (B2+B3)","592855.68","592844","-11.68",""',
  '"B5. 最終金額 (A1+B4)","2552855.68","2552844","-11.68",""',
  '"A8. 其他機關自辦費用","0","0","",""',
  '',
  '"新增項目含稅計算","","","",""',
  '"項目","公式值","採用值","",""',
  '"新增項目佔比(%)","113.31","113.31","",""',
  '"012 承商利潤分攤","57637.47","57637.47","",""',
  '"013 職安衛分攤","","0","",""',
  '"014 材料檢試驗分攤","","0","",""',
  '"小計（A4+分攤合計）","","634036.47","",""',
  '"0B 營業稅（小計×5%）","","31701.82","",""',
  '"新增項目含稅金額（捨去至整數）","665738.29","665738","",""',
].join("\r\n");
{
  const rows = parseCSV(CUR_CSV);
  t("驗證訊息內的千分位逗號不撐破欄位", rows.find(r => r[0].startsWith("B3."))[4], "追加時稅金超過上限 28,230.65");

  const st = csvToState(rows);
  t("辨識為計算表", st !== null, true);
  t("A1 還原", st.inp.A1, "1960000");
  t("A3 負值還原", st.inp.A3, "-171013.68");
  t("A5pct 還原（右欄空白不得誤判）", st.inp.A5pct, "10");
  t("左右相同的欄位不得標成手動調整", Object.keys(st.rov).sort().join(","), "A5,B3");
  t("A5 手動調整值", st.rov.A5, "50855.61");
  t("B3 手動調整值", st.rov.B3, "28231");
  t("分攤與公式值相同不得標成調整", Object.keys(st.niOv).length, 0);

  // 還原後重算，須與 CSV 上的數字完全一致
  const lv = calcLeft(st.inp), rv = calcRight(lv, st.rov);
  t("重算 B1", lv.B1, 508670.77);
  t("重算 初算 A5", lv.A5, 50867.07);
  t("重算 初算 B5", lv.B5, 2552855.68);
  t("重算 調整 B2", rv.B2, 564613);
  t("重算 調整 B5", rv.B5, 2552844);
  t("警告一併還原", getWarnings(rv).B3 !== undefined, true);
  const ni = calcNewItemTax(lv, st.niOv);
  t("重算 佔比", ni.ratioPct, 113.31);
  t("重算 含稅金額", ni.totalFinal, 665738);
}

console.log("\n=== CSV 匯入：分攤覆寫與格式辨識 ===");
{
  const st = csvToState(parseCSV([
    '"項目","初算值","調整值","差額","驗證訊息"',
    '"A1. 原契約金額","1000","1000","",""',
    '"A2. 原契約工項追加金額","100","100","",""',
    '"A4a. 新增項目（不議價）","50","50","",""',
    '"012 承商利潤分攤","57637.47","57000","",""',
    '"013 職安衛分攤","","1200","",""',
    '"014 材料檢試驗分攤","","0","",""',
  ].join("\n")));
  t("012 分攤覆寫", st.niOv.share012, "57000");
  t("013 分攤覆寫", st.niOv.share013, "1200");
  t("014 為 0 不算覆寫", st.niOv.share014, undefined);
  t("不相干的 CSV 回傳 null", csvToState(parseCSV('"甲","乙"\n"1","2"')), null);
  t("計算表不會被誤判為紀錄檔", csvToHistory(parseCSV(CUR_CSV)), null);
}

console.log("\n=== CSV 匯入：殘檔與偽標頭必須拒絕（codex review 補強）===");
{
  // 只命中一兩列的截斷檔：放行會載入一份幾乎全空的資料，覆蓋掉畫面上真正的計算
  t("只有 1 列命中 → 拒絕", csvToState(parseCSV('"A1. 原契約金額","1960000","1960000","",""')), null);
  t("只有 2 列命中 → 拒絕", csvToState(parseCSV(
    '"A1. 原契約金額","1960000","1960000","",""\n"A2. 原契約工項追加金額","100","100","",""')), null);
  t("3 列命中 → 接受", csvToState(parseCSV(
    '"A1. 原契約金額","1960000","1960000","",""\n"A2. 原契約工項追加金額","100","100","",""\n"A3. 原契約工項減少金額","0","0","",""'
  )) !== null, true);
  t("完整匯出檔仍然接受", csvToState(parseCSV(CUR_CSV)) !== null, true);

  // 光有前兩欄標頭、沒有任何數值欄的寬表：放行會匯進一批空紀錄
  t("寬表缺 _初算 欄 → 拒絕", csvToHistory(parseCSV('"案件名稱","儲存時間"\n"甲案","2026/7/27"')), null);
  t("寬表有 _初算 欄 → 接受", csvToHistory(parseCSV(
    '"案件名稱","儲存時間","A1_初算","A1_調整"\n"甲案","2026/7/27","1000","1000"'
  )).length, 1);
}

console.log("\n=== CSV 匯入：引號跳脫的案件名稱 ===");
{
  const rows = parseCSV('"案件名稱","甲案 ""A標"" 追加"\n"A1. 原契約金額","1000","1000","",""\n"A2. 原契約工項追加金額","100","100","",""\n"A3. 原契約工項減少金額","0","0","",""');
  t("欄位內的跳脫雙引號還原", rows[0][1], '甲案 "A標" 追加');
  t("案件名稱帶雙引號可匯入", csvToState(rows).inp.name, '甲案 "A標" 追加');
}

console.log("\n=== CSV 匯入：「匯出計算紀錄」寬表還原 ===");
{
  const head = ["案件名稱", "儲存時間"];
  const vals = ["甲案", "2026/7/27 下午4:00:00"];
  const put = (k, l, r) => { head.push(k + "_初算"); vals.push(l); if (k !== "A5pct") { head.push(k + "_調整"); vals.push(r); } };
  put("A1","1000000","1000000"); put("A2","100000","100000"); put("A3","0","0");
  put("A4a","0","0"); put("A4b","0","0"); put("A4","0","0"); put("B1","100000","100000");
  put("A5pct","10",""); put("A5","10000","9999"); put("A6","0","0"); put("A7","0","0");
  put("B2","110000","109999"); put("B3","5500","5499"); put("B4","115500","115498");
  put("B5","1115500","1115498"); put("A8","0","0");
  const csv = [head, vals].map(r => r.map(v => `"${v}"`).join(",")).join("\n") + "\n";

  const list = csvToHistory(parseCSV(csv));
  t("辨識為紀錄檔且筆數正確", list.length, 1);
  t("案件名稱", list[0].name, "甲案");
  t("儲存時間保留", list[0].date, "2026/7/27 下午4:00:00");
  t("僅 A5/B3 視為手動調整", Object.keys(list[0].rov).sort().join(","), "A5,B3");
  t("初算 B5 重算一致", list[0].b5l, 1115500);
  t("調整 B5 重算一致", list[0].b5r, 1115498);
}

console.log("\n=== v1.4.0 A8 015物調計入 B2（第一二雙溪第四次變更實際數字）===");
{
  const lv = calcLeft({ A1:"1479781635", A2:"10424048.06", A3:"-17290683.22", A4a:"0", A4b:"0", A5pct:"10",
    A6:"1272320", A7:"1352392.94", A8:"-7069407", C1:"" });
  t("B1", lv.B1, -6866635.16);
  t("A5 物調不計利潤", lv.A5, -686663.51);
  t("B2 含物調", lv.B2, -11997992.73);
  t("B3 物調一起課稅", lv.B3, -599899.63);
  t("B5", lv.B5, 1467183742.64);
  const rv = calcRight(lv, { A5:"-686663.79", B3:"-599902" });
  t("調整 B2", rv.B2, -11997993.01);
  t("調整 B5", rv.B5, 1467183739.99);
  const w = getWarnings(rv);
  t("物調不做正負方向檢核", w.A8, undefined);
  const lv2 = calcLeft({ A1:"0", A2:"100", A3:"0", A4a:"0", A4b:"0", A5pct:"10", A6:"0", A7:"0", A8:"0", C1:"99999" });
  t("C1 自辦費用不進 B2", lv2.B2, 110);
}

console.log("\n=== v1.4.0 舊資料：A8 自辦費用須搬到 C1，不得被當成物調 ===");
{
  const st = csvToState(parseCSV([
    '"A1. 原契約金額","1000","1000","",""',
    '"A2. 原契約工項追加金額","100","100","",""',
    '"A3. 原契約工項減少金額","0","0","",""',
    '"A8. 其他機關自辦費用","500","600","",""',
  ].join("\n")));
  t("舊計算表 A8 標籤 → C1", st.inp.C1, "500");
  t("舊計算表 A8（物調）留空", st.inp.A8, "");
  t("舊計算表調整值 → C1", st.rov.C1, "600");
  t("舊計算表重算 B2 不含自辦費用", calcLeft(st.inp).B2, 100);

  const oldHist = csvToHistory(parseCSV(
    '"案件名稱","儲存時間","A1_初算","A1_調整","A8_初算","A8_調整"\n"甲案","2026/7/27","1000","1000","500","500"'));
  t("舊紀錄檔 A8 → C1", oldHist[0].inp.C1, "500");
  t("舊紀錄檔 A8（物調）留空", oldHist[0].inp.A8, "");
  const newHist = csvToHistory(parseCSV(
    '"案件名稱","儲存時間","A1_初算","A1_調整","A8_初算","A8_調整","C1_初算","C1_調整"\n"乙案","2026/9/29","1000","1000","-70","-70","500","500"'));
  t("新紀錄檔 A8 物調", newHist[0].inp.A8, "-70");
  t("新紀錄檔 C1", newHist[0].inp.C1, "500");

  const rec = migrateRecord({ id: 1, name: "舊", inp: { name:"舊", A1:"1000", A2:"100", A5pct:"0", A8:"500" }, rov: { A8:"600" }, b5l: 0, b5r: 0 });
  t("localStorage 舊紀錄 A8 → C1", rec.inp.C1, "500");
  t("localStorage 舊紀錄 A8 清空", rec.inp.A8, "");
  t("localStorage 舊紀錄調整值 → C1", rec.rov.C1, "600");
  t("localStorage 舊紀錄 B5 重算不含自辦費用", rec.b5l, 1105);
  const cur = { id: 2, inp: { A8:"-70", C1:"500" }, rov: {} };
  t("新紀錄不重複搬移", migrateRecord(cur), cur);
}

console.log("\n=== v1.4.2 013/014 可與 B1 反向，不再警告；012 仍檢核 ===");
{
  // 第一二雙溪第四次變更：包工費追減，013/014 因工期展延追加
  const lv = calcLeft({ A1:"1479781635", A2:"10424048.06", A3:"-17290683.22", A4a:"0", A4b:"0", A5pct:"10",
    A6:"1272320", A7:"1352392.94", A8:"-7069407", C1:"" });
  const w = getWarnings(lv);
  t("追減時 013 為正不警告", w.A6, undefined);
  t("追減時 014 為正不警告", w.A7, undefined);
  const w2 = getWarnings(calcRight(lv, { A5:"100" }));
  t("追減時 012 為正仍警告", w2.A5 !== undefined, true);
}

console.log(`\n合計：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
