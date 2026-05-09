import { test, expect } from "bun:test"
import { interactiveLogin } from "../../src/omni-studio/interactive"

test("interactiveLogin is exported as an async function", () => {
  expect(typeof interactiveLogin).toBe("function")
})
