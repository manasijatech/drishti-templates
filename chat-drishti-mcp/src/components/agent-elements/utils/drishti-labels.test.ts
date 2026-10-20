import { describe, expect, test } from "bun:test";
import {
  getDrishtiOperation,
  getStepDetail,
  getStepLabel,
} from "./drishti-labels";

const newsCall = {
  type: "dynamic-tool",
  toolName: "execute_tool",
  input: {
    name: "get_news",
    arguments: { query: { symbols: "BANKNIFTY", lookback_days: 7 } },
  },
};

describe("drishti step labels", () => {
  test("names the real operation behind execute_tool", () => {
    expect(getDrishtiOperation(newsCall)).toBe("get_news");
  });

  test("uses plain words for running and finished steps", () => {
    expect(getStepLabel("get_news", true)).toBe("Reading news");
    expect(getStepLabel("get_news", false)).toBe("Read news");
    expect(getStepLabel("some_new_tool", false)).toBe("Some new tool");
  });

  test("shows symbols and window instead of the operation name", () => {
    expect(getStepDetail(newsCall)).toBe("BANKNIFTY · last 7 days");
    expect(
      getStepDetail({
        toolName: "execute_tool",
        input: {
          name: "search_concalls",
          arguments: { search_query: "capex", symbols: ["TCS", "INFY"] },
        },
      }),
    ).toBe('TCS, INFY · "capex"');
  });
});
