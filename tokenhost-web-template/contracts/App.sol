// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract Tweet_contract {
    uint256 public timestamp;
    address public sender;
    string public text;

    constructor(string memory _text) {
        sender = tx.origin;
        timestamp = block.timestamp;
        text = _text;
    }

    struct TweetData {
        address self;
        uint256 timestamp;
        address sender;
        string text;
    }

    function getAll() external view returns (TweetData memory) {
        return
            TweetData({
                self: address(this),
                timestamp: timestamp,
                sender: sender,
                text: text
            });
    }
}

contract App {
    address[] public Tweet_list;

    function get_Tweet_N(uint256 index)
        public
        view
        returns (Tweet_contract.TweetData memory)
    {
        return Tweet_contract(Tweet_list[index]).getAll();
    }

    function get_first_Tweet_N(uint256 count, uint256 offset)
        public
        view
        returns (Tweet_contract.TweetData[] memory)
    {
        require(
            offset + count <= Tweet_list.length,
            "Offset + count out of bounds"
        );
        Tweet_contract.TweetData[] memory results =
            new Tweet_contract.TweetData[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = Tweet_contract(Tweet_list[i + offset]).getAll();
        }
        return results;
    }

    function get_last_Tweet_N(uint256 count, uint256 offset)
        public
        view
        returns (Tweet_contract.TweetData[] memory)
    {
        require(
            count + offset <= Tweet_list.length,
            "Count + offset out of bounds"
        );
        Tweet_contract.TweetData[] memory results =
            new Tweet_contract.TweetData[](count);
        uint256 len = Tweet_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Tweet_contract(Tweet_list[idx]).getAll();
        }
        return results;
    }

    function get_Tweet_list_length() public view returns (uint256) {
        return Tweet_list.length;
    }

    function get_Tweet_user_length(address user) public view returns (uint256) {
        return user_map[user].Tweet_list.length;
    }

    function get_Tweet_user_N(address user, uint256 index)
        public
        view
        returns (Tweet_contract.TweetData memory)
    {
        return Tweet_contract(user_map[user].Tweet_list[index]).getAll();
    }

    function get_last_Tweet_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Tweet_contract.TweetData[] memory) {
        require(
            count + offset <= user_map[user].Tweet_list.length,
            "Count + offset out of bounds"
        );
        Tweet_contract.TweetData[] memory results =
            new Tweet_contract.TweetData[](count);
        uint256 len = user_map[user].Tweet_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Tweet_contract(user_map[user].Tweet_list[idx])
                .getAll();
        }
        return results;
    }

    struct UserInfo {
        address owner;
        bool exists;
        address[] Tweet_list;
        uint256 Tweet_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] public UserInfoList;
    uint256 public UserInfoListLength;

    event NewTweet(address indexed sender, address indexed contractAddress);

    function new_Tweet(string memory text) public returns (address) {
        address mynew = address(new Tweet_contract({_text: text}));

        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_Tweet(mynew);
        }
        user_map[tx.origin].Tweet_list.push(mynew);
        user_map[tx.origin].Tweet_list_length += 1;

        Tweet_list.push(mynew);
        // The length of Tweet_list is tracked by the array length

        emit NewTweet(tx.origin, mynew);

        return mynew;
    }

    function create_user_on_new_Tweet(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory Tweet_list_ = new address[](0);
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                Tweet_list: Tweet_list_,
                Tweet_list_length: 0
            });
    }
}
