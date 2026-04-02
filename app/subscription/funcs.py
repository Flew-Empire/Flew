def get_grpc_gun(path: str) -> str:
    if not path.startswith("/"):
        return path

    servicename = path.rsplit("/", 1)[0]
    streamname = path.rsplit("/", 1)[1].split("|")[0]
    
    if streamname == "Tun":
        return servicename[1:]
    
    return "%s%s%s" % (servicename, "/", streamname)

def get_grpc_multi(path: str) -> str:
    if not path.startswith("/"):
        return path
    
    servicename = path.rsplit("/", 1)[0]
    parts = path.rsplit("/", 1)[1].split("|")
    streamname = parts[1] if len(parts) > 1 else parts[0]

    return "%s%s%s" % (servicename, "/", streamname)