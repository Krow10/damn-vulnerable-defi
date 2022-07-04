import base64
import sys

from eth_keys import keys
from eth_utils import decode_hex

def decode(string: str) -> str:
	return base64.b64decode("".join([chr(int(x, 16))for x in string.split(' ')])).decode('utf-8')

examples = ["4d 48 68 6a 4e 6a 63 34 5a 57 59 78 59 57 45 30 4e 54 5a 6b 59 54 59 31 59 7a 5a 6d 59 7a 55 34 4e 6a 46 6b 4e 44 51 34 4f 54 4a 6a 5a 47 5a 68 59 7a 42 6a 4e 6d 4d 34 59 7a 49 31 4e 6a 42 69 5a 6a 42 6a 4f 57 5a 69 59 32 52 68 5a 54 4a 6d 4e 44 63 7a 4e 57 45 35", \
			"4d 48 67 79 4d 44 67 79 4e 44 4a 6a 4e 44 42 68 59 32 52 6d 59 54 6c 6c 5a 44 67 34 4f 57 55 32 4f 44 56 6a 4d 6a 4d 31 4e 44 64 68 59 32 4a 6c 5a 44 6c 69 5a 57 5a 6a 4e 6a 41 7a 4e 7a 46 6c 4f 54 67 33 4e 57 5a 69 59 32 51 33 4d 7a 59 7a 4e 44 42 69 59 6a 51 34"]

if __name__ == "__main__":
	if (len(sys.argv) >= 3):
		print(f"Usage : {sys.argv[0]} [encoded string]")
		exit(1)
	elif (len(sys.argv) == 2):
		print(f"Decoded :", decode(sys.argv[1]))
	else:
		print("Compromised private keys :")
		for s in examples:
			priv_key_bytes = decode_hex(decode(s))
			priv_key = keys.PrivateKey(priv_key_bytes)
			pub_key = priv_key.public_key
			print(f"Recovered private key for address {pub_key.to_checksum_address()}: {priv_key.to_hex()}")
