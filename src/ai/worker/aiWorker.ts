/// <reference lib="webworker" />
/**
 * Web worker that runs computer opponents off the main thread, so expensive searches (e.g. the
 * Monte-Carlo expert) never make animations or taps stutter.
 */
import { registerGames } from '@/games'
import { type AiRequest, handleAiRequest } from './protocol'

registerGames()

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AiRequest>) => void) | null
  postMessage: (message: unknown) => void
}

scope.onmessage = (event) => {
  void handleAiRequest(event.data).then((response) => scope.postMessage(response))
}
