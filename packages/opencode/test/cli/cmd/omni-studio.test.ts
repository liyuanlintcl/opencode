import { test, expect } from "bun:test"
import { OmniStudioCommand } from "../../../src/cli/cmd/omni-studio"

test("OmniStudioCommand is exported", () => {
  expect(OmniStudioCommand).toBeDefined()
  expect(OmniStudioCommand.command).toBe("omni-studio")
})
