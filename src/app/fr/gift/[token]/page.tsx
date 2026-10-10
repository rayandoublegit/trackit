import type { Metadata } from "next";
import { GiftPage, giftPageMetadata } from "@/app/gift/GiftPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return giftPageMetadata(token, "fr");
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  return <GiftPage token={token} lang="fr" />;
}
