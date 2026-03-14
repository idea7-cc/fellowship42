import type { Access, Where } from 'payload'

type AppUser = {
  id?: number | string
  person?: number | string | { id?: number | string | null } | null
  roles?: string[] | string | null
  churches?: Array<number | string | { id?: number | string | null } | null> | null
} | null

const normalizeRoles = (user: AppUser): string[] => {
  if (!user?.roles) {
    return []
  }

  return Array.isArray(user.roles) ? user.roles.filter(Boolean) : [user.roles]
}

export const normalizeChurchIDs = (user: AppUser): Array<number | string> => {
  if (!user?.churches?.length) {
    return []
  }

  return user.churches.flatMap((church) => {
    if (!church) {
      return []
    }

    if (typeof church === 'object') {
      return church.id ? [church.id] : []
    }

    return [church]
  })
}

export const normalizePersonID = (user: AppUser): number | string | null => {
  if (!user?.person) {
    return null
  }

  if (typeof user.person === 'object') {
    return user.person.id ?? null
  }

  return user.person
}

export const hasRole = (user: AppUser, roles: string[]): boolean => {
  const userRoles = normalizeRoles(user)
  return roles.some((role) => userRoles.includes(role))
}

export const canManageChurchID = (user: AppUser, churchID: number | string): boolean => {
  if (!user) {
    return false
  }

  if (hasRole(user, ['super-admin'])) {
    return true
  }

  if (!hasRole(user, ['church-admin', 'content-editor', 'ministry-leader'])) {
    return false
  }

  return normalizeChurchIDs(user).includes(churchID)
}

export const isLoggedIn: Access = ({ req }) => Boolean(req.user)

export const isSuperAdmin = ({ req }: { req: { user?: AppUser } }): boolean =>
  hasRole(req.user ?? null, ['super-admin'])

export const canManageChurchContent: Access = ({ req }) =>
  Boolean(req.user) &&
  hasRole(req.user ?? null, ['super-admin', 'church-admin', 'content-editor', 'ministry-leader'])

export const canManageFinance: Access = ({ req }) =>
  Boolean(req.user) && hasRole(req.user ?? null, ['super-admin', 'church-admin', 'finance'])

export const churchScopedAccess = (allowedRoles: string[]): Access => {
  return ({ req }) => {
    if (!req.user) {
      return false
    }

    if (hasRole(req.user, ['super-admin'])) {
      return true
    }

    if (!hasRole(req.user, allowedRoles)) {
      return false
    }

    const churchIDs = normalizeChurchIDs(req.user)

    if (!churchIDs.length) {
      return false
    }

    return {
      church: {
        in: churchIDs,
      },
    } satisfies Where
  }
}

export const ownPersonAccess = (personField = 'person'): Access => {
  return ({ req }) => {
    if (!req.user) {
      return false
    }

    if (hasRole(req.user, ['super-admin'])) {
      return true
    }

    const personID = normalizePersonID(req.user)

    if (!personID) {
      return false
    }

    return {
      [personField]: {
        equals: personID,
      },
    } satisfies Where
  }
}

export const ownOrChurchScopedAccess = ({
  allowedRoles,
  personField = 'person',
}: {
  allowedRoles: string[]
  personField?: string
}): Access => {
  return ({ req }) => {
    if (!req.user) {
      return false
    }

    if (hasRole(req.user, ['super-admin'])) {
      return true
    }

    if (hasRole(req.user, allowedRoles)) {
      const churchIDs = normalizeChurchIDs(req.user)

      if (churchIDs.length) {
        return {
          church: {
            in: churchIDs,
          },
        } satisfies Where
      }
    }

    const personID = normalizePersonID(req.user)

    if (!personID) {
      return false
    }

    return {
      [personField]: {
        equals: personID,
      },
    } satisfies Where
  }
}

export const churchReadAccess: Access = ({ req }) => {
  if (req.user) {
    if (hasRole(req.user, ['super-admin'])) {
      return true
    }

    const churchIDs = normalizeChurchIDs(req.user)

    if (churchIDs.length) {
      const churchFilter: Where = {
        id: {
          in: churchIDs,
        },
      }

      return churchFilter
    }
  }

  const publishedFilter: Where = {
    status: {
      equals: 'published',
    },
  }

  return publishedFilter
}

export const publicPublishedContentAccess: Access = ({ req }) => {
  if (req.user) {
    if (hasRole(req.user, ['super-admin'])) {
      return true
    }

    const churchIDs = normalizeChurchIDs(req.user)

    if (churchIDs.length) {
      const combinedFilter: Where = {
        or: [
          {
            church: {
              in: churchIDs,
            },
          },
          {
            status: {
              equals: 'published',
            },
          },
        ],
      }

      return combinedFilter
    }
  }

  const publishedFilter: Where = {
    status: {
      equals: 'published',
    },
  }

  return publishedFilter
}
