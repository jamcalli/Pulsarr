import { Type } from '@sinclair/typebox';

export const schemas = {
  watchlist: {
    querystring: Type.Object({
      start: Type.Optional(Type.Number({ default: 0 }))
    }),
    response: {
      200: Type.Union([
        Type.Array(Type.Object({
          title: Type.String(),
          key: Type.String(),
          type: Type.String(),
          guids: Type.Array(Type.String())
        })),
        Type.Object({
          error: Type.String()
        })
      ])
    }
  },
  othersWatchlist: {
    response: {
      200: Type.Union([
        Type.Array(Type.Object({
          title: Type.String(),
          key: Type.String(),
          type: Type.String(),
          guids: Type.Array(Type.String())
        })),
        Type.Object({
          error: Type.String()
        })
      ])
    }
  },
  ping: {
    response: {
      200: Type.Object({
        success: Type.Boolean()
      })
    }
  }
};