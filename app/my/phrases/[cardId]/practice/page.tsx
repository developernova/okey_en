import { PhrasePracticeScreen } from "@/components/phrase-practice-screen"

export default async function PhrasePracticePage({
  params,
}: {
  params: Promise<{ cardId: string }>
}) {
  const { cardId } = await params
  return <PhrasePracticeScreen cardId={cardId} />
}
