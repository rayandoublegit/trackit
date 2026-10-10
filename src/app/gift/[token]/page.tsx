import type { Metadata } from "next";
import { GiftPage, giftPageMetadata } from "../GiftPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return giftPageMetadata(token, "en");
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  return <GiftPage token={token} lang="en" />;
}
