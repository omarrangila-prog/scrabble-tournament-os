/**
 * The Art Activity receipt as a one-page PDF, made in the browser.
 *
 * What somebody saves after registering: who, what, when, where and what is owed. It records that a
 * registration and (for online payment) a payment proof were received, not that the money was checked.
 */

export interface ArtReceipt {
  receiptNo: string;
  fullName: string;
  age: string;
  phone: string;
  lines: { label: string; amount: number }[];
  total: number;
  paymentLine: string;
  when: string;
  where: string;
  registeredAt: string;
}

const money = (n: number) => (n < 0 ? `- Rs. ${(-n).toLocaleString("en-PK")}` : `Rs. ${n.toLocaleString("en-PK")}`);

export async function downloadArtReceipt(r: ArtReceipt): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [105, 170] });
  const brown: [number, number, number] = [62, 47, 35];
  const green: [number, number, number] = [47, 93, 58];
  const W = 105;
  let y = 16;

  doc.setFillColor(245, 240, 228);
  doc.rect(0, 0, W, 170, "F");
  doc.setTextColor(200, 155, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("REGISTRATION RECEIPT", W / 2, y, { align: "center" });
  y += 7;
  doc.setTextColor(...brown);
  doc.setFontSize(15);
  doc.text("Art Activity", W / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Receipt no. ${r.receiptNo}`, W / 2, y, { align: "center" });
  y += 8;

  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 105, 90);
    doc.text(label.toUpperCase(), 10, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...brown);
    const lines = doc.splitTextToSize(value, 58) as string[];
    doc.text(lines, W - 10, y, { align: "right" });
    y += 5.5 * lines.length + 1.5;
  };
  const rule = () => {
    doc.setDrawColor(220, 210, 195);
    doc.line(10, y - 2, W - 10, y - 2);
    y += 2;
  };

  row("Name", r.fullName, true);
  row("Age", r.age);
  row("Phone", r.phone);
  if (r.when) row("When", r.when);
  if (r.where) row("Where", r.where);
  rule();
  for (const l of r.lines) row(l.label, money(l.amount));
  rule();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...green);
  doc.text("TOTAL", 10, y + 1);
  doc.text(money(r.total), W - 10, y + 1, { align: "right" });
  y += 9;
  row("Payment", r.paymentLine);
  row("Registered", r.registeredAt);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 105, 90);
  doc.text("Please show this receipt at the registration desk.", W / 2, 160, { align: "center" });
  doc.save(`art-activity-receipt-${r.receiptNo}.pdf`);
}
