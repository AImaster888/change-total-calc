// 從 index.html 實際抽出計算函式來測，不是抄一份
const fs = require("fs");
const html = fs.readFileSync("D:/320code/change-total-calc/index.html", "utf8");
const src = html.slice(html.indexOf('<script type="text/babel">') + 26, html.indexOf("function App()"));
const body = src
  .replace(/const \{ useState[^\n]*\n/, "")
  .replace(/^const ROWS = \[[\s\S]*?\n\];$/m, "")
  .replace(/^const INPUT_KEYS[^\n]*$/m, 'const INPUT_KEYS = ["A1","A2","A3","A4a","A4b","A5pct","A6","A7","A8"];')
  .replace(/^const EXAMPLE[^\n]*$/m, "");
const mod = new Function(body + "\nreturn { p, cut2, calcLeft, calcRight, calcNewItemTax, getWarnings };")();
const { cut2, calcLeft, calcRight, calcNewItemTax, getWarnings, p } = mod;

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
  const lv = calcLeft({ A1:"25000000", A2:"1350000.55", A3:"-820000.35", A4a:"650000.8", A4b:"0", A5pct:"10", A6:"11800.1", A7:"23600.2", A8:"10000" });
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

console.log(`\n合計：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
