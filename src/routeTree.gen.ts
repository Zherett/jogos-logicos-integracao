/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

import { Route as rootRouteImport } from './routes/__root'
import { Route as RankingRouteImport } from './routes/ranking'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AdminRouteImport } from './routes/admin'

const RankingRoute = RankingRouteImport.update({
  id: '/ranking',
  path: '/ranking',
  getParentRoute: () => rootRouteImport,
} as any)

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

const AdminRoute = AdminRouteImport.update({
  id: '/admin',
  path: '/admin',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/admin': typeof AdminRoute
  '/ranking': typeof RankingRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/admin': typeof AdminRoute
  '/ranking': typeof RankingRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/admin': typeof AdminRoute
  '/ranking': typeof RankingRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/admin' | '/ranking'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/admin' | '/ranking'
  id: '__root__' | '/' | '/admin' | '/ranking'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AdminRoute: typeof AdminRoute
  RankingRoute: typeof RankingRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/admin': {
      id: '/admin'
      path: '/admin'
      fullPath: '/admin'
      preLoaderRoute: typeof AdminRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/ranking': {
      id: '/ranking'
      path: '/ranking'
      fullPath: '/ranking'
      preLoaderRoute: typeof RankingRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AdminRoute: AdminRoute,
  RankingRoute: RankingRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
