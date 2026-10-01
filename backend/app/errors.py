class UserError(Exception):
    """An expected failure whose message is safe and useful to show to the user."""


def friendly_download_error(exc: Exception) -> UserError:
    msg = str(exc).lower()
    rules = [
        (("private video", "this video is private"), "This video is private. Use a public or unlisted link."),
        (("members-only", "join this channel", "members only"), "This video is for channel members only."),
        (("confirm your age", "age-restricted", "age restricted", "inappropriate for some users"),
         "This video is age-restricted and can't be processed."),
        (("live event", "is live", "will begin in", "premieres in"),
         "Live streams and premieres can't be processed until they finish."),
        (("not available in your country", "blocked it in your country", "geo-restrict", "geo restrict", "not made this video available"),
         "This video isn't available in the server's region."),
        (("copyright",), "This video was removed for copyright reasons."),
        (("video unavailable", "is unavailable", "has been removed", "no longer available", "does not exist", "account associated"),
         "This video is unavailable. Check the link and try again."),
        (("sign in to confirm", "not a bot", "http error 429", "too many requests"),
         "YouTube is temporarily blocking downloads from our server. Please try again later."),
        (("unsupported url", "is not a valid url"), "That doesn't look like a valid YouTube video link."),
        (("timed out", "timeout", "temporary failure", "connection", "network"),
         "The download failed because of a network problem. Please try again."),
    ]
    for needles, text in rules:
        if any(n in msg for n in needles):
            return UserError(text)
    return UserError("Couldn't download this video. It may be restricted or unavailable.")
