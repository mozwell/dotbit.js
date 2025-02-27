import { DotBit, BitAccount, BitPluginBase } from 'dotbit'
import { ethers } from 'ethers'
import { fetchJson } from '@ethersproject/web'
import { BigNumber } from '@ethersproject/bignumber'
import { hexConcat, hexDataSlice, hexZeroPad } from '@ethersproject/bytes'
import { toUtf8String } from '@ethersproject/strings'

const matcherIpfs = /^(ipfs):\/\/(.*)$/i

const matchers = [
  /^(https):\/\/(.*)$/i,
  /^(data):(.*)$/i,
  matcherIpfs,
  /^eip155:[0-9]+\/(erc[0-9]+):(.*)$/i,
]

// Trim off the ipfs:// prefix and return the default gateway URL
export function getIpfsLink (link: string, gateway = 'https://gateway.ipfs.io'): string {
  if (link.match(/^ipfs:\/\/ipfs\//i)) {
    link = link.substring(12)
  }
  else if (link.match(/^ipfs:\/\//i)) {
    link = link.substring(7)
  }
  else {
    throw new Error(`unsupported IPFS format '${link}'`)
  }

  return `${gateway}/ipfs/${link}`
}

function _parseBytes (result: string, start: number): null | string {
  if (result === '0x') {
    return null
  }

  const offset: number = BigNumber.from(hexDataSlice(result, start, start + 32)).toNumber()
  const length: number = BigNumber.from(hexDataSlice(result, offset, offset + 32)).toNumber()

  return hexDataSlice(result, offset + 32, offset + 32 + length)
}
function _parseString (result: string, start: number): null | string {
  try {
    return toUtf8String(_parseBytes(result, start))
  }
  catch (error) { }
  return null
}

interface BitPluginAvatarOptions {
  ipfsGateway?: string,
}

export class BitPluginAvatar implements BitPluginBase {
  version = '0.0.1'
  name = 'BitPluginAvatar'

  ipfs = 'https://gateway.ipfs.io'

  constructor (options?: BitPluginAvatarOptions) {
    if (options) {
      if (options.ipfsGateway) {
        this.ipfs = options.ipfsGateway
      }
    }
  }

  onInstall (dotbit: DotBit) {
  }

  onUninstall (dotbit: DotBit) {
  }

  onInitAccount (bitAccount: BitAccount) {
    const plugin = this

    bitAccount.avatar = async function (this: BitAccount) {
      const linkage: Array<{ type: string, content: string }> = [{ type: 'account', content: this.account }]
      const provider = new ethers.providers.AnkrProvider()
      try {
        const account = await this.info()
        if (!account?.owner_key) {
          return null
        }
        // test data for jeffx.bit
        // const avatar = "eip155:1/erc721:0x265385c7f4132228A0d54EB1A9e7460b91c0cC68/29233";
        const avatarRecord = await this.records('profile.avatar')
        const avatar = avatarRecord[0]?.value
        if (!avatar) {
          return null
        }

        for (let i = 0; i < matchers.length; i++) {
          const match = avatar.match(matchers[i])
          if (match == null) {
            continue
          }

          const scheme = match[1].toLowerCase()

          switch (scheme) {
            case 'https':
              linkage.push({ type: 'url', content: avatar })
              return { linkage, url: avatar }

            case 'data':
              linkage.push({ type: 'data', content: avatar })
              return { linkage, url: avatar }

            case 'ipfs':
              linkage.push({ type: 'ipfs', content: avatar })
              return { linkage, url: getIpfsLink(avatar, plugin.ipfs) }

            case 'erc721':
            case 'erc1155': {
              // Depending on the ERC type, use tokenURI(uint256) or url(uint256)
              const selector = (scheme === 'erc721') ? '0xc87b56dd' : '0x0e89341c'
              linkage.push({ type: scheme, content: avatar })

              // The owner of this name
              // todo: only use under eth
              const owner = account.owner_key

              const comps = (match[2] || '').split('/')
              if (comps.length !== 2) {
                return null
              }

              const addr = provider.formatter.address(comps[0])
              const tokenId = hexZeroPad(BigNumber.from(comps[1]).toHexString(), 32)

              // Check that this account owns the token
              if (scheme === 'erc721') {
                // ownerOf(uint256 tokenId)
                const tokenOwner = provider.formatter.callAddress(await provider.call({
                  to: addr, data: hexConcat(['0x6352211e', tokenId])
                }))
                if (owner !== tokenOwner) {
                  return null
                }
                linkage.push({ type: 'owner', content: tokenOwner })
              }
              else if (scheme === 'erc1155') {
                // balanceOf(address owner, uint256 tokenId)
                const balance = BigNumber.from(await provider.call({
                  to: addr, data: hexConcat(['0x00fdd58e', hexZeroPad(owner, 32), tokenId])
                }))
                if (balance.isZero()) {
                  return null
                }
                linkage.push({ type: 'balance', content: balance.toString() })
              }

              // Call the token contract for the metadata URL
              const tx = {
                to: provider.formatter.address(comps[0]),
                data: hexConcat([selector, tokenId])
              }

              let metadataUrl = _parseString(await provider.call(tx), 0)
              if (metadataUrl == null) {
                return null
              }
              linkage.push({ type: 'metadata-url-base', content: metadataUrl })

              // ERC-1155 allows a generic {id} in the URL
              if (scheme === 'erc1155') {
                metadataUrl = metadataUrl.replace('{id}', tokenId.substring(2))
                linkage.push({ type: 'metadata-url-expanded', content: metadataUrl })
              }

              // Transform IPFS metadata links
              if (metadataUrl.match(/^ipfs:/i)) {
                metadataUrl = getIpfsLink(metadataUrl, plugin.ipfs)
              }

              linkage.push({ type: 'metadata-url', content: metadataUrl })

              // Get the token metadata
              const metadata = await fetchJson(metadataUrl)
              if (!metadata) {
                return null
              }
              linkage.push({ type: 'metadata', content: JSON.stringify(metadata) })

              // Pull the image URL out
              let imageUrl = metadata.image
              if (typeof (imageUrl) !== 'string') {
                return null
              }

              if (imageUrl.match(/^(https:\/\/|data:)/i)) {
                // Allow
              }
              else {
                // Transform IPFS link to gateway
                const ipfs = imageUrl.match(matcherIpfs)
                if (ipfs == null) {
                  return null
                }

                linkage.push({ type: 'url-ipfs', content: imageUrl })
                imageUrl = getIpfsLink(imageUrl)
              }

              linkage.push({ type: 'url', content: imageUrl })

              return { linkage, url: imageUrl }
            }
          }
        }
      }
      catch (error) {
        return null
      }

      return null
    }
  }
}
