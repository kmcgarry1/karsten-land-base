import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CommanderSelector from "../CommanderSelector.vue";

describe("CommanderSelector rendering", () => {
  it("renders untrusted card names as text rather than markup", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const wrapper = mount(CommanderSelector, {
      props: {
        commanderInfo: {
          names: [payload],
          colourIdentity: [],
          count: 1,
          librarySize: 99,
        },
        isLoading: false,
        unresolvedCards: ["<script>alert(1)</script>"],
      },
    });
    expect(wrapper.text()).toContain(payload);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("script").exists()).toBe(false);
  });
});
