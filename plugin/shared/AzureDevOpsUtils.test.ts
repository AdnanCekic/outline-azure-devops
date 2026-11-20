import { MentionType, UnfurlResourceType } from "@shared/types";
import { AzureDevOpsUtils } from "./AzureDevOpsUtils";

describe("AzureDevOpsUtils.parseUrl", () => {
  it("should parse a work item URL", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_workitems/edit/123"
      )
    ).toEqual({
      type: UnfurlResourceType.Issue,
      organization: "contoso",
      project: "Fabrikam",
      id: 123,
    });
  });

  it("should parse a work item URL with a trailing slug", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_workitems/edit/123/"
      )
    ).toMatchObject({ type: UnfurlResourceType.Issue, id: 123 });
  });

  it("should decode project names with spaces", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/My%20Project/_workitems/edit/7"
      )
    ).toMatchObject({ project: "My Project", id: 7 });
  });

  it("should parse a work item opened from a board", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_boards/board/t/Team/Stories?workitem=42"
      )
    ).toEqual({
      type: UnfurlResourceType.Issue,
      organization: "contoso",
      project: "Fabrikam",
      id: 42,
    });
  });

  it("should parse a work item opened from a sprint", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_sprints/taskboard/Team/Fabrikam/Sprint%201?workitem=99"
      )
    ).toMatchObject({ type: UnfurlResourceType.Issue, id: 99 });
  });

  it("should parse a pull request URL", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_git/web-app/pullrequest/15"
      )
    ).toEqual({
      type: UnfurlResourceType.PR,
      organization: "contoso",
      project: "Fabrikam",
      repository: "web-app",
      id: 15,
    });
  });

  it("should parse legacy visualstudio.com URLs", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://contoso.visualstudio.com/Fabrikam/_workitems/edit/5"
      )
    ).toMatchObject({
      type: UnfurlResourceType.Issue,
      organization: "contoso",
      project: "Fabrikam",
      id: 5,
    });
  });

  it("should skip the default collection in legacy URLs", () => {
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://contoso.visualstudio.com/DefaultCollection/Fabrikam/_git/api/pullrequest/3"
      )
    ).toMatchObject({
      type: UnfurlResourceType.PR,
      project: "Fabrikam",
      repository: "api",
      id: 3,
    });
  });

  it("should return undefined for unsupported URLs", () => {
    expect(AzureDevOpsUtils.parseUrl("not a url")).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl(
        "http://dev.azure.com/contoso/Fabrikam/_workitems/edit/1"
      )
    ).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://example.com/contoso/Fabrikam/_workitems/edit/1"
      )
    ).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_git/web-app"
      )
    ).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl("https://dev.azure.com/contoso/_settings/users")
    ).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://dev.azure.com/contoso/Fabrikam/_workitems/edit/abc"
      )
    ).toBeUndefined();
    expect(
      AzureDevOpsUtils.parseUrl(
        "https://a.b.visualstudio.com/Fabrikam/_workitems/edit/1"
      )
    ).toBeUndefined();
  });
});

describe("AzureDevOpsUtils.mentionType", () => {
  it("should return the mention type for supported URLs", () => {
    expect(
      AzureDevOpsUtils.mentionType(
        new URL("https://dev.azure.com/contoso/Fabrikam/_workitems/edit/1")
      )
    ).toBe(MentionType.Issue);
    expect(
      AzureDevOpsUtils.mentionType(
        new URL(
          "https://dev.azure.com/contoso/Fabrikam/_git/repo/pullrequest/1"
        )
      )
    ).toBe(MentionType.PullRequest);
    expect(
      AzureDevOpsUtils.mentionType(new URL("https://dev.azure.com/contoso"))
    ).toBeUndefined();
  });
});

describe("AzureDevOpsUtils colors", () => {
  it("should return colors for pull request states", () => {
    expect(AzureDevOpsUtils.getColorForPullRequest("active")).toBe("#1f75cb");
    expect(AzureDevOpsUtils.getColorForPullRequest("active", true)).toBe(
      "#848d97"
    );
    expect(AzureDevOpsUtils.getColorForPullRequest("unknown")).toBe("#848d97");
  });

  it("should return colors for work item categories", () => {
    expect(AzureDevOpsUtils.getColorForCategory("Completed")).toBe("#339933");
    expect(AzureDevOpsUtils.getColorForCategory()).toBe("#848d97");
  });
});
