import { GraphQLClient } from 'graphql-request'

const clients = new Map<string, GraphQLClient>()

export function getGraphClient(graphUrl: string): GraphQLClient {
  let client = clients.get(graphUrl)
  if (!client) {
    client = new GraphQLClient(graphUrl)
    clients.set(graphUrl, client)
  }
  return client
}
