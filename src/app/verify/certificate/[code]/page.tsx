import { redirect } from "next/navigation";

/**
 * Certificate verification by QR.
 *
 * The QR on a printed certificate points here. The verification screen itself
 * lives at /verify, which also accepts a code typed by hand — one screen, so
 * scanning and typing cannot drift apart in wording or behaviour.
 */
export default async function CertificateVerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/verify/${encodeURIComponent(code)}`);
}
