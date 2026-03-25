/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as churches from "../churches.js";
import type * as contributions from "../contributions.js";
import type * as courseEnrollments from "../courseEnrollments.js";
import type * as courses from "../courses.js";
import type * as events from "../events.js";
import type * as groupMemberships from "../groupMemberships.js";
import type * as groups from "../groups.js";
import type * as landingPages from "../landingPages.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_records from "../lib/records.js";
import type * as ministries from "../ministries.js";
import type * as people from "../people.js";
import type * as sermons from "../sermons.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  churches: typeof churches;
  contributions: typeof contributions;
  courseEnrollments: typeof courseEnrollments;
  courses: typeof courses;
  events: typeof events;
  groupMemberships: typeof groupMemberships;
  groups: typeof groups;
  landingPages: typeof landingPages;
  "lib/access": typeof lib_access;
  "lib/records": typeof lib_records;
  ministries: typeof ministries;
  people: typeof people;
  sermons: typeof sermons;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
