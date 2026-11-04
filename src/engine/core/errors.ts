export class GameError extends Error {
  override name = 'GameError'
}

export class NotYourTurnError extends GameError {
  override name = 'NotYourTurnError'
}

export class IllegalActionError extends GameError {
  override name = 'IllegalActionError'
}

export class GameOverError extends GameError {
  override name = 'GameOverError'
}
